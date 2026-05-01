// apps/student/proxy.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseProxy } from '@gabby/lib/proxy-base';

export async function proxy(req: NextRequest) {
  const { res, user } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;

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
      return NextResponse.redirect(new URL(loginPath, req.url));
    }
    return res;
  }

  // --- B. ログイン済みの場合 ---
  const userType = user.app_metadata?.user_type as string | undefined; // '0': admin, '1': student
  const isLicensed = user.app_metadata?.is_licensed === true;

  const isAdmin = userType === '0';
  const isStudent = userType === '1';

  // 1. 認可ガード：管理者アプリへの権限確認とライセンスチェック
  // 管理者以外は有効なライセンスが必須
  if (!isPublicRoute && isStudent && !isLicensed) {
    // 1. リダイレクトレスポンスを作成
    const response = NextResponse.redirect(new URL(loginPath, req.url));
    
    // 2. Supabaseに関連するすべてのクッキーを削除
    // req.cookies.getAll() で取得したクッキー名のうち 'sb-' で始まるものをすべて削除
    req.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith('sb-')) {
        response.cookies.delete(cookie.name);
      }
    });

    return response;
  }

  // 2. ログイン済みでルート(/)やログインページにアクセスした場合の振り分け
  if (pathname === '/' || pathname === loginPath) {
    if (isAdmin) {
      // 管理者は管理者アプリへ強制移動
      return NextResponse.redirect(new URL(`${adminUrl}${dashboardPath}`));
    } else {
      // 生徒は自身のダッシュボードへ
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    }
  }

  // 3. 認可ガード: 管理者アプリURLを直接叩いた場合
  if (isAdmin && pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL(dashboardPath, req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};