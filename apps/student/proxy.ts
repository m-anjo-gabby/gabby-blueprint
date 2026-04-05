import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseProxy } from '@gabby/lib/proxy-base';

export async function proxy(req: NextRequest) {
  const { res, user } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;

  // 環境変数から他方アプリのURLを取得
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL!;
  
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
      // ログインしていない状態で保護されたページへアクセスした場合はログインへ
      return NextResponse.redirect(new URL(loginPath, req.url));
    }
    return res;
  }

  // --- B. ログイン済みの場合 ---
  // メタデータに role がない場合は 'student' (生徒) としてフォールバック
  const role = (user.app_metadata?.role as string | undefined) || 'student';

  // 1. ログイン済みでルート(/)やログインページにアクセスした場合
  if (pathname === '/' || pathname === loginPath) {
    if (role === 'admin') {
      // 管理者がStudentアプリに来た場合は、Adminアプリのダッシュボードへ強制移動
      return NextResponse.redirect(new URL(`${adminUrl}${dashboardPath}`));
    } else {
      // 生徒（またはロールなし）の場合は自身のダッシュボードへ
      // 絶対URL(studentUrl)を使わず、現在のドメイン(req.url)内でのリダイレクトにする
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    }
  }

  // 2. 認可ガード: Studentアプリ(3000番)なのにAdminロールがアクセスしてきた場合
  if (role === 'admin' && !isPublicRoute) {
    // AdminはAdminアプリ(3001番)へリダイレクト
    return NextResponse.redirect(new URL(`${adminUrl}${dashboardPath}`));
  }

  // 3. 生徒ロール（またはロールなし）が /dashboard などにアクセスしている場合はそのまま通す
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};