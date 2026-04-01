import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseProxy } from '@gabby/lib'; // index.ts経由のクリーンなインポート

export async function proxy(req: NextRequest) {
  const { res, user } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;

  // 環境変数からURLを取得
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL!;
  const studentUrl = process.env.NEXT_PUBLIC_STUDENT_URL!;

  const loginPath = '/login';
  const isPublicRoute = pathname === loginPath || 
                        pathname.startsWith('/auth') || 
                        ['/forgot-password', '/update-password'].includes(pathname);

  // A. 未ログインの場合
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  // B. ログイン済みの場合
  if (user) {
    const role = user.app_metadata?.role as string | undefined;

    // ログイン済みでルート(/)やログインページにアクセスした場合
    if (pathname === '/' || pathname === loginPath) {
      // ロールに応じて適切なアプリのダッシュボードへ振り分け
      const dest = role === 'student' ? `${studentUrl}/dashboard` : `${adminUrl}/dashboard`;
      return NextResponse.redirect(new URL(dest));
    }

    // 認可ガード: StudentアプリなのにStudentロール以外（Admin等）がアクセスした場合
    if (role !== 'student' && !isPublicRoute) {
      // Admin用ダッシュボードへ強制リダイレクト
      return NextResponse.redirect(new URL(`${adminUrl}/dashboard`));
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};