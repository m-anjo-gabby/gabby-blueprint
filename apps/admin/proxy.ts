// apps/admin/proxy.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseProxy } from '@gabby/lib/proxy-base';
import { canAccessPath } from './lib/navigation';

export async function proxy(req: NextRequest) {
  const { res, user } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;

  const studentUrl = process.env.NEXT_PUBLIC_STUDENT_URL!;
  const loginPath = '/login';
  const dashboardPath = '/dashboard';
  
  // 公開ルートの判定
  const isPublicRoute = 
    pathname === loginPath || 
    pathname.startsWith('/auth') || 
    ['/forgot-password', '/update-password', '/favicon.ico'].includes(pathname);

  // --- A. 未ログインの場合 ---
  if (!user) {
    if (!isPublicRoute) {
      return NextResponse.redirect(new URL(loginPath, req.url));
    }
    return res;
  }

  // --- B. ログイン済みの場合 ---
  // トリガーによって同期された app_metadata を取得
  const userType = user.app_metadata?.user_type as string | undefined; // '0': admin, '1': student
  const roles = (user.app_metadata?.roles as string[] | undefined) || [];
  const isAllowedToAdmin = userType === '0';

  // 1. ルート(/)やログインページにアクセスした場合の振り分け
  if (pathname === '/' || pathname === loginPath) {
    if (isAllowedToAdmin) {
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    } else {
      // 非管理者（生徒）は生徒用アプリへリダイレクト
      return NextResponse.redirect(new URL(`${studentUrl}${dashboardPath}`));
    }
  }

  // 2. 認可ガード：管理者以外が管理者アプリを直接叩いた場合
  if (!isAllowedToAdmin && !isPublicRoute) {
    return NextResponse.redirect(new URL(`${studentUrl}${dashboardPath}`));
  }

  // 3. 詳細認可ガード
  if (!isPublicRoute && isAllowedToAdmin) {
    if (!canAccessPath(pathname, roles)) {
      // 権限がないパスへのアクセスはダッシュボードへ戻す
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};