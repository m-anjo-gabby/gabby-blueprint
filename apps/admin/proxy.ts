// apps/admin/proxy.ts
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

export async function proxy(req: NextRequest) {
  const { res, user, userType, roles, requestId } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;
  const loginPath = '/login';
  const dashboardPath = '/dashboard';

  const logger = createRequestLogger('admin', req, requestId);

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
  const isAdmin = userType === USER_TYPES.ADMIN;

  // 1. 生徒（非管理者）がアドミンアプリにアクセスした場合
  // リダイレクトループ（!isAdmin -> /login -> isLogged -> /dashboard）を防ぐため、
  // セッションを物理的に破棄してからログイン画面へ戻します。
  if (!isAdmin) {
    logger.warn('proxy:admin_access_blocked', `Non-admin session detected in admin app (User ID: ${user.id})`, {
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

  // 3. 詳細認可ガード（パス単位の権限チェック）
  if (isAdmin && !isPublicRoute) {
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
    appLabel: 'Admin Access',
    payload: { roles },
  });

  return res;
}

// Next.js が config を静的解析するため、matcher はリテラルで記述する必要がある
// （import した変数を参照すると解析エラーになりビルドが壊れる）
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};