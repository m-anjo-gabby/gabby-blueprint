import { type NextRequest } from 'next/server';
import {
  createSupabaseProxy,
  redirectAndClearSession,
  redirectTo,
  isDefaultPublicRoute,
  logPageView,
} from '@gabby/lib/proxy-base';
import { createRequestLogger } from '@gabby/lib/logger';
import { USER_TYPES } from '@gabby/types/user';
import {
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_REQUEST_HEADER_ID,
  IMPERSONATION_REQUEST_HEADER_ADMIN_ID,
  decodeImpersonationCookie,
  isImpersonationExpired,
} from '@gabby/lib/impersonation';

// ディレクトリ構成に基づいた、生徒がアクセス可能な有効な画面ルートのホワイトリスト
const VALID_STUDENT_ROUTES = [
  '/dashboard',
  '/favorites',
  '/library',
  '/profile',
  '/training',
  '/monitor',
  '/notice',
  '/coach-matching',
  '/calendar',
];

export async function proxy(req: NextRequest) {
  const { res, user, userType, roles, requestId, supabase } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;
  const loginPath = '/login';
  const dashboardPath = '/dashboard';

  const logger = createRequestLogger('student', req, requestId);

  // --- 代理ログインセッションのTTLチェック ---
  // Cookieは非表示(httpOnly)のため生徒UIには一切影響しない。ログのタグ付けと、
  // 一定時間経過後の自動サインアウトのためだけに使用する。
  const impersonation = decodeImpersonationCookie(req.cookies.get(IMPERSONATION_COOKIE_NAME)?.value);

  if (user && impersonation && isImpersonationExpired(impersonation)) {
    logger.warn('proxy:impersonation_expired', `Impersonation session expired (User ID: ${user.id})`, {
      userId: user.id,
      payload: { impersonationId: impersonation.id, adminId: impersonation.adminId },
    });

    await supabase.auth.signOut();
    const expiredResponse = redirectAndClearSession(req, loginPath);
    expiredResponse.cookies.delete(IMPERSONATION_COOKIE_NAME);
    return expiredResponse;
  }

  if (user && impersonation) {
    // Server Action / Server Component側で headers() 経由で取得し、ログに相関情報として付与する
    res.headers.set(IMPERSONATION_REQUEST_HEADER_ID, impersonation.id);
    res.headers.set(IMPERSONATION_REQUEST_HEADER_ADMIN_ID, impersonation.adminId);
  }

  // 公開ルートの判定
  const isPublicRoute = isDefaultPublicRoute(pathname, {
    extraExactPaths: ['/forgot-password', '/update-password'],
    extraPrefixes: ['/auth'],
  });

  // A. 未ログイン
  if (!user) {
    if (!isPublicRoute) {
      // 認可が必要なページへの未ログインアクセスは記録に値する（必要に応じてinfoログを追加可能）
      return redirectTo(req, loginPath);
    }
    return res;
  }

  const isLicensed = user.app_metadata?.is_licensed === true;
  const isAdmin = userType === USER_TYPES.ADMIN;

  // B. 認可チェック
  // 1. 管理者が生徒用パスにアクセスした場合
  // アドミンアプリと同様、セッションが混在してループするのを防ぐためクッキーをクリアします
  if (isAdmin && !isPublicRoute) {
    logger.warn('proxy:admin_access_denied', `Admin session detected in student app (User ID: ${user.id})`, {
      userId: user.id,
      path: pathname,
      payload: { userType }
    });

    return redirectAndClearSession(req, loginPath);
  }

  // 2. ライセンス未保有の生徒
  if (!isAdmin && !isLicensed && !isPublicRoute) {
    logger.error('proxy:license_check_failed', `License check failed (User ID: ${user.id})`, {
      userId: user.id,
      path: pathname,
      payload: { appMetadata: user.app_metadata }
    });

    return redirectAndClearSession(req, loginPath);
  }

  // C. ログイン済みでのルート/ログインページアクセス
  if (pathname === '/' || pathname === loginPath) {
    return redirectTo(req, dashboardPath);
  }

  // --- C-1. モニター画面の認可チェック ---
  const isMonitorRoute = pathname === '/monitor' || pathname.startsWith('/monitor/');
  const hasMonitorRole = roles.includes('monitor');

  if (isMonitorRoute && !hasMonitorRole) {
    logger.warn('proxy:monitor_access_denied', `Unauthorized monitor access attempt (User ID: ${user.id})`, {
      userId: user.id,
      path: pathname,
    });
    return redirectTo(req, dashboardPath);
  }

  // --- C-2. 直接入力および無効なアドレスへのアクセス制御 ---
  // 公開ルート（メールリンク等）ではなく、かつ定義された有効な生徒ルート（ホワイトリスト）にも前方一致しない場合
  const isValidStudentRoute = VALID_STUDENT_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));

  if (!isPublicRoute && !isValidStudentRoute) {
    logger.info('proxy:invalid_route_redirect', `Invalid path direct access redirected to dashboard: ${pathname}`, {
      userId: user.id,
      path: pathname,
    });
    return redirectTo(req, dashboardPath);
  }

  // --- D. アクセスログの記録 ---
  // Server Action (POSTリクエスト) は proxy:page_view ログから完全に除外する
  // これにより、通信頻度の高い学習中の実績同期ログが画面アクセスログと混ざるのを防ぐ
  logPageView(logger, req, user, pathname, isPublicRoute, impersonation ? {
    payload: { impersonationId: impersonation.id, adminId: impersonation.adminId },
  } : undefined);

  return res;
}

// Next.js が config を静的解析するため、matcher はリテラルで記述する必要がある
// （import した変数を参照すると解析エラーになりビルドが壊れる）
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};