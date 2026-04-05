import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseProxy } from '@gabby/lib';

export async function proxy(req: NextRequest) {
  const { res, user } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;

  // 環境変数から他方アプリ（生徒側）のURLを取得
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
      // ログインしていない状態で保護されたページへアクセスした場合はログインへ
      return NextResponse.redirect(new URL(loginPath, req.url));
    }
    return res;
  }

  // --- B. ログイン済みの場合 ---
  // role が未定義の場合は 'student' (生徒) としてフォールバック
  const role = (user.app_metadata?.role as string | undefined) || 'student';

  // 1. ログイン済みでルート(/)やログインページにアクセスした場合
  if (pathname === '/' || pathname === loginPath) {
    if (role === 'admin') {
      // アドミンの場合は、自身のダッシュボードへ
      // 3001番ポート内でのリダイレクトを保証するため req.url をベースにする
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    } else {
      // 生徒（またはロールなし）がアドミンアプリに来た場合は、生徒アプリへ強制移動
      return NextResponse.redirect(new URL(`${studentUrl}${dashboardPath}`));
    }
  }

  // 2. 認可ガード：アドミンアプリ(3001番)なのにアドミンロール以外がアクセスしてきた場合
  if (role !== 'admin' && !isPublicRoute) {
    // 生徒アカウントがアドミンURLを直接叩いた場合は、生徒アプリへ強制送還
    return NextResponse.redirect(new URL(`${studentUrl}${dashboardPath}`));
  }

  // 3. アドミンロールが /dashboard などにアクセスしている場合はそのまま通す
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};