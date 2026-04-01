import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseProxy } from '@gabby/lib'; // index.ts経由でインポート

export async function proxy(req: NextRequest) {
  const { res, user } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;

  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL!;
  const studentUrl = process.env.NEXT_PUBLIC_STUDENT_URL!;
  
  const loginPath = '/login';
  const isPublicRoute = pathname === loginPath || pathname.startsWith('/auth') || 
                        ['/forgot-password', '/update-password'].includes(pathname);

  // A. 未ログイン
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  // B. ログイン済み
  if (user) {
    const role = user.app_metadata?.role as string | undefined;

    // ログイン済みで / や /login に来た場合
    if (pathname === '/' || pathname === loginPath) {
      const dest = role === 'admin' ? `${adminUrl}/dashboard` : `${studentUrl}/dashboard`;
      return NextResponse.redirect(new URL(dest));
    }

    // 認可ガード：AdminアプリなのにAdminじゃない場合
    if (role !== 'admin' && !isPublicRoute) {
      return NextResponse.redirect(new URL(`${studentUrl}/dashboard`));
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};