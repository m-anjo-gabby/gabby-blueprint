// apps/admin/proxy.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseProxy } from '@gabby/lib/proxy-base';
import { createLogger } from '@gabby/lib/logger/logger';
import { canAccessPath } from './lib/navigation';

export async function proxy(req: NextRequest) {
  const { res, user } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;
  const loginPath = '/login';
  const dashboardPath = '/dashboard';

  const logger = createLogger('admin');

  // 公開ルートの判定
  const isPublicRoute = pathname === loginPath || pathname.startsWith('/auth') || 
    ['/forgot-password', '/update-password', '/favicon.ico'].includes(pathname);

  // --- A. 未ログインの場合 ---
  if (!user) {
    if (!isPublicRoute) return NextResponse.redirect(new URL(loginPath, req.url));
    return res;
  }

  // --- B. ログイン済みの場合 ---
  const userType = user.app_metadata?.user_type as string | undefined;
  const roles = (user.app_metadata?.roles as string[] | undefined) || [];
  const isAdmin = userType === '0';

  // 1. 生徒がアドミンアプリにアクセスした場合
  if (!isAdmin && !isPublicRoute) {
    logger.warn('proxy:admin_access_blocked', `Non-admin access blocked: ${user.email}`, {
      userId: user.id,
      path: pathname,
      payload: { userType }
    });
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  // 2. ルート/ログインページアクセス
  if (pathname === '/' || pathname === loginPath) {
    return NextResponse.redirect(new URL(dashboardPath, req.url));
  }

  // 3. 詳細認可ガード（パス単位の権限チェック）
  if (isAdmin && !isPublicRoute) {
    if (!canAccessPath(pathname, roles)) {
      logger.warn('proxy:role_access_denied', `Role-based access denied: ${user.email} -> ${pathname}`, {
        userId: user.id,
        path: pathname,
        payload: { roles }
      });
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    }
  }

  // --- C. アクセスログ（PageView）の記録 ---
  if (!isPublicRoute) {
    // prefetchを除外する場合はここで判定を入れる
    const isPrefetch = req.headers.get('purpose') === 'prefetch' || !!req.headers.get('x-nextjs-data');
    
    logger.info('page_view', `Admin Access: ${pathname}`, {
      userId: user.id,
      path: pathname,
      payload: {
        roles,
        isPrefetch,
        method: req.method,
        referer: req.headers.get('referer'),
      }
    });
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};