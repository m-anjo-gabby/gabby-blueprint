import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { UserType } from '@gabby/types/user';
import { createLogger, type createRequestLogger } from '@gabby/lib/logger';
import { buildLoginPath, RETURN_TO_PARAM, sanitizeReturnTo } from './auth/returnTo';
import { IMPERSONATION_REQUEST_HEADER_ADMIN_ID, IMPERSONATION_REQUEST_HEADER_ID } from './impersonation';
import { CLIENT_LOG_PATH } from './logger/client';

export type ProxyLogger = ReturnType<typeof createRequestLogger>;

/**
 * proxy が付けて、Server Action・Server Component 側（getLogContext）が信用するヘッダー。
 * proxy が付けない場合（未ログイン・代理ログインでない等）にブラウザから送られた値が素通りしないよう、入口で必ず除く。
 */
const PROXY_TRUSTED_HEADERS = ['x-user-id', 'x-request-id', IMPERSONATION_REQUEST_HEADER_ID, IMPERSONATION_REQUEST_HEADER_ADMIN_ID];

function withoutTrustedHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  PROXY_TRUSTED_HEADERS.forEach((name) => headers.delete(name));
  return headers;
}

export async function createSupabaseProxy(req: NextRequest) {
  let res = NextResponse.next({
    request: { headers: withoutTrustedHeaders(req.headers) },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: { headers: withoutTrustedHeaders(req.headers) } });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() は Supabase Auth サーバーとの通信を伴い JWT を検証するため、
  // これ単体でセッションの正当性確認として十分（getSession() の重複呼び出しは不要）
  // Supabase側の障害・タイムアウトで例外が飛ぶと Middleware 全体が落ち、
  // 全リクエストが500になってしまうため、失敗時は未ログイン扱いにフォールバックする。
  let user: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    createLogger('common').error(
      'proxy:auth_check_failed',
      'supabase.auth.getUser() failed in proxy',
      {
        path: req.nextUrl.pathname,
        err,
      }
    );
  }

  const userType = user?.app_metadata?.user_type as UserType | undefined;
  const roles = (user?.app_metadata?.roles as string[] | undefined) || [];

  // --- 共通ヘッダーの注入 ---
  // リクエスト単位のトレースID。Server Action側でも headers() 経由で同じ値を取得し、
  // Middlewareのログと突き合わせられるようにする。
  const requestId = crypto.randomUUID();
  res.headers.set('x-request-id', requestId);

  if (user) {
    // リクエストヘッダー（Action側で headers() で取れる値）にセット
    res.headers.set('x-user-id', user.id);
  }

  return { res, user, userType, roles, supabase, requestId };
}

/**
 * req.url を基準にした相対パスへのリダイレクトレスポンスを生成する共通ヘルパー。
 * 各 proxy.ts に散在していた `NextResponse.redirect(new URL(path, req.url))` を集約する。
 */
export function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url));
}

/**
 * 未ログインで保護された画面を開いた場合のログイン画面への転送。
 * 画面表示（GET）の場合は元のパスを `?next=` に付け、ログイン後にその画面へ戻す
 * （メール内のチャットルームへのリンク等。packages/lib/auth/returnTo.ts）。
 */
export function redirectToLogin(req: NextRequest, loginPath: string): NextResponse {
  const returnTo = req.method === 'GET' ? `${req.nextUrl.pathname}${req.nextUrl.search}` : null;
  return redirectTo(req, buildLoginPath(loginPath, returnTo));
}

/**
 * ログイン済みでログイン画面を開いた場合の転送先。`?next=` に安全な戻り先があればそこへ、無ければ既定の画面へ。
 */
export function redirectAfterLogin(req: NextRequest, loginPath: string, defaultPath: string): NextResponse {
  const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get(RETURN_TO_PARAM), loginPath);
  return redirectTo(req, returnTo ?? defaultPath);
}

/**
 * 権限不一致（別アプリのセッション混入）を検知した際の共通処理。
 * リダイレクトループを防ぐため、Supabase関連クッキーを物理的に破棄してからログインページへ戻す。
 */
export function redirectAndClearSession(req: NextRequest, path: string): NextResponse {
  const response = redirectTo(req, path);
  req.cookies.getAll().forEach((c) => {
    if (c.name.startsWith('sb-')) response.cookies.delete(c.name);
  });
  return response;
}

/**
 * 公開ルート（未ログインでもアクセス可能なパス）判定の共通ロジック。
 * アプリ固有の追加公開パスは extraPaths / extraPrefixes で渡す。
 */
export function isDefaultPublicRoute(
  pathname: string,
  options?: { extraExactPaths?: string[]; extraPrefixes?: string[] }
): boolean {
  const loginPath = '/login';
  // CLIENT_LOG_PATH: ブラウザのログの受け口。エラー画面は未ログインでも出るため公開する（受け口側で大きさ・回数を制限）
  const exactPaths = ['/favicon.ico', CLIENT_LOG_PATH, ...(options?.extraExactPaths ?? [])];
  const prefixes = [...(options?.extraPrefixes ?? [])];

  if (pathname === loginPath) return true;
  if (exactPaths.includes(pathname)) return true;
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

/**
 * ページアクセスログ（page_view）記録の共通処理。
 * GETリクエストかつ非prefetch、非公開ルートの場合のみ記録する。
 */
export function logPageView(
  logger: ProxyLogger,
  req: NextRequest,
  user: User | null,
  pathname: string,
  isPublicRoute: boolean,
  options?: { appLabel?: string; payload?: Record<string, unknown> }
): void {
  const isPageAccess = req.method === 'GET';
  const isPrefetch = req.headers.get('purpose') === 'prefetch' || !!req.headers.get('x-nextjs-data');

  if (!isPageAccess || isPrefetch || isPublicRoute || !user) return;

  const message = options?.appLabel ? `${options.appLabel}: ${pathname}` : `Access: ${pathname}`;

  logger.info('proxy:page_view', message, {
    userId: user.id,
    path: pathname,
    payload: {
      ...options?.payload,
      method: req.method,
      userAgent: req.headers.get('user-agent'),
      referer: req.headers.get('referer'),
    },
  });
}
