// apps/admin/proxy.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseProxy } from '@gabby/lib/proxy-base';

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
  const role = (user.app_metadata?.role as string | undefined) || 'student';

  // 1. ルート(/)やログインページにアクセスした場合の振り分け
  if (pathname === '/' || pathname === loginPath) {
    if (role === 'admin') {
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    } else {
      // 非管理者（生徒）は生徒用アプリへリダイレクト
      return NextResponse.redirect(new URL(`${studentUrl}${dashboardPath}`));
    }
  }

  // 2. 認可ガード：管理者以外が管理者アプリを直接叩いた場合
  if (role !== 'admin' && !isPublicRoute) {
    return NextResponse.redirect(new URL(`${studentUrl}${dashboardPath}`));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};