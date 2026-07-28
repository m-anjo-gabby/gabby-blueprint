// apps/coach/proxy.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseProxy } from '@gabby/lib/proxy-base';
import { createRequestLogger } from '@gabby/lib/logger';
import { USER_TYPES } from '@gabby/types/user';
import { canAccessPath } from './lib/navigation';

export async function proxy(req: NextRequest) {
  const { res, user } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;
  const loginPath = '/login';
  const dashboardPath = '/dashboard';

  const logger = createRequestLogger('coach', req);

  // 公開ルートの判定（現時点ではログイン画面のみ。パスワード再設定等は今後追加）
  const isPublicRoute = pathname === loginPath || pathname === '/favicon.ico';

  // --- A. 未ログインの場合 ---
  if (!user) {
    if (!isPublicRoute) return NextResponse.redirect(new URL(loginPath, req.url));
    return res;
  }

  // --- B. ログイン済みの場合 ---
  const userType = user.app_metadata?.user_type as string | undefined;
  const roles = (user.app_metadata?.roles as string[] | undefined) || [];
  const isCoach = userType === USER_TYPES.COACH;

  // 1. コーチ以外（生徒・管理者）がコーチアプリにアクセスした場合
  // リダイレクトループ（!isCoach -> /login -> isLogged -> /dashboard）を防ぐため、
  // セッションを物理的に破棄してからログイン画面へ戻します。
  if (!isCoach) {
    logger.warn('proxy:coach_access_blocked', `Non-coach session detected in coach app (User ID: ${user.id})`, {
      userId: user.id,
      path: pathname,
      payload: { userType }
    });

    const response = NextResponse.redirect(new URL(loginPath, req.url));
    req.cookies.getAll().forEach((c) => {
      if (c.name.startsWith('sb-')) response.cookies.delete(c.name);
    });
    return response;
  }

  // 2. ルート/ログインページアクセス
  if (pathname === '/' || pathname === loginPath) {
    return NextResponse.redirect(new URL(dashboardPath, req.url));
  }

  // 3. 詳細認可ガード（パス単位の権限チェック。将来的な画面追加に備えた土台）
  if (!isPublicRoute) {
    if (!canAccessPath(pathname, roles)) {
      logger.warn('proxy:role_access_denied', `Role-based access denied (User ID: ${user.id})`, {
        userId: user.id,
        path: pathname,
        payload: { roles }
      });
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    }
  }

  // --- C. アクセスログ（PageView）の記録 ---
  const isPageAccess = req.method === 'GET';
  const isPrefetch = req.headers.get('purpose') === 'prefetch' || !!req.headers.get('x-nextjs-data');

  if (isPageAccess && !isPrefetch && !isPublicRoute && user) {
    logger.info('page_view', `Coach Access: ${pathname}`, {
      userId: user.id,
      path: pathname,
      payload: {
        roles,
        method: req.method,
        userAgent: req.headers.get('user-agent'),
        referer: req.headers.get('referer'),
      }
    });
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
