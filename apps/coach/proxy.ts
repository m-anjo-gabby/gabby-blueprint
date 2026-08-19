// apps/coach/proxy.ts
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
import { canAccessPath } from './lib/navigation';
import {
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_REQUEST_HEADER_ID,
  IMPERSONATION_REQUEST_HEADER_ADMIN_ID,
  decodeImpersonationCookie,
  isImpersonationExpired,
} from '@gabby/lib/impersonation';

export async function proxy(req: NextRequest) {
  const { res, user, userType, roles, requestId, supabase } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;
  const loginPath = '/login';
  const dashboardPath = '/dashboard';

  const logger = createRequestLogger('coach', req, requestId);

  // --- 代理ログインセッションのTTLチェック ---
  // Cookieは非表示(httpOnly)のためコーチUIには一切影響しない。ログのタグ付けと、
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

  // --- A. 未ログインの場合 ---
  if (!user) {
    if (!isPublicRoute) return redirectTo(req, loginPath);
    return res;
  }

  // --- B. ログイン済みの場合 ---
  const isCoach = userType === USER_TYPES.COACH;

  // 1. コーチ以外（生徒・管理者）がコーチアプリにアクセスした場合
  // リダイレクトループ（!isCoach -> /login -> isLogged -> /dashboard）を防ぐため、
  // セッションを物理的に破棄してからログイン画面へ戻します。
  // ただし /auth/impersonate 等の公開ルートは対象外とする。代理ログインのマジックリンクを
  // 開いた際、管理者自身のセッションCookieがまだ残っている状態でこの判定が先に走ってしまうと、
  // verifyOtp によるコーチセッションへの切り替え前にログイン画面へ弾かれてしまうため。
  if (!isCoach && !isPublicRoute) {
    logger.warn('proxy:coach_access_blocked', `Non-coach session detected in coach app (User ID: ${user.id})`, {
      userId: user.id,
      path: pathname,
      payload: { userType }
    });

    return redirectAndClearSession(req, loginPath);
  }

  // 2. ルート/ログインページアクセス
  if (pathname === '/' || pathname === loginPath) {
    return redirectTo(req, dashboardPath);
  }

  // 3. 詳細認可ガード（パス単位の権限チェック。将来的な画面追加に備えた土台）
  if (!isPublicRoute) {
    if (!canAccessPath(pathname, roles)) {
      logger.warn('proxy:role_access_denied', `Role-based access denied (User ID: ${user.id})`, {
        userId: user.id,
        path: pathname,
        payload: { roles }
      });
      return redirectTo(req, dashboardPath);
    }
  }

  // --- C. アクセスログ（PageView）の記録 ---
  logPageView(logger, req, user, pathname, isPublicRoute, {
    appLabel: 'Coach Access',
    payload: impersonation ? { roles, impersonationId: impersonation.id, adminId: impersonation.adminId } : { roles },
  });

  return res;
}

// Next.js が config を静的解析するため、matcher はリテラルで記述する必要がある
// （import した変数を参照すると解析エラーになりビルドが壊れる）
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
