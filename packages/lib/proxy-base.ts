import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { UserType } from '@gabby/types/user';
import { createLogger, type createRequestLogger } from '@gabby/lib/logger';

export type ProxyLogger = ReturnType<typeof createRequestLogger>;

export async function createSupabaseProxy(req: NextRequest) {
  let res = NextResponse.next({
    request: { headers: req.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
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
        payload: { error: err instanceof Error ? err.message : String(err) },
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
  const exactPaths = ['/favicon.ico', ...(options?.extraExactPaths ?? [])];
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

  logger.info('page_view', message, {
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
