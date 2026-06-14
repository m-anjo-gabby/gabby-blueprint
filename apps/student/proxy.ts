import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseProxy } from '@gabby/lib/proxy-base';
import { createLogger } from '@gabby/lib/logger';

// ディレクトリ構成に基づいた、生徒がアクセス可能な有効な画面ルートのホワイトリスト
const VALID_STUDENT_ROUTES = [
  '/dashboard',
  '/favorites',
  '/library',
  '/profile',
  '/training',
];

export async function proxy(req: NextRequest) {
  const { res, user } = await createSupabaseProxy(req);
  const { pathname } = req.nextUrl;
  const loginPath = '/login';
  const dashboardPath = '/dashboard';

  const logger = createLogger('student');

  // 公開ルートの判定
  const isPublicRoute = pathname === loginPath || pathname.startsWith('/auth') || 
    ['/forgot-password', '/update-password', '/favicon.ico'].includes(pathname);

  // A. 未ログイン
  if (!user) {
    if (!isPublicRoute) {
      // 認可が必要なページへの未ログインアクセスは記録に値する（必要に応じてinfoログを追加可能）
      return NextResponse.redirect(new URL(loginPath, req.url));
    }
    return res;
  }

  const userType = user.app_metadata?.user_type as string | undefined;
  const isLicensed = user.app_metadata?.is_licensed === true;
  const isAdmin = userType === '0';

  // B. 認可チェック
  // 1. 管理者が生徒用パスにアクセスした場合
  // アドミンアプリと同様、セッションが混在してループするのを防ぐためクッキーをクリアします
  if (isAdmin && !isPublicRoute) {
    logger.warn('proxy:admin_access_denied', `Admin session detected in student app: ${user.email}`, {
      userId: user.id,
      email: user.email,
      path: pathname,
      payload: { userType }
    });

    const response = NextResponse.redirect(new URL(loginPath, req.url));
    req.cookies.getAll().forEach((c) => {
      if (c.name.startsWith('sb-')) response.cookies.delete(c.name);
    });
    return response;
  }

  // 2. ライセンス未保有の生徒
  if (!isAdmin && !isLicensed && !isPublicRoute) {
    logger.error('proxy:license_check_failed', `License check failed: ${user.email}`, {
      userId: user.id,
      email: user.email,
      path: pathname,
      payload: { appMetadata: user.app_metadata }
    });
    
    const response = NextResponse.redirect(new URL(loginPath, req.url));
    // Supabaseに関連するすべてのクッキーを削除
    req.cookies.getAll().forEach((c) => {
      if (c.name.startsWith('sb-')) response.cookies.delete(c.name);
    });
    return response;
  }

  // C. ログイン済みでのルート/ログインページアクセス
  if (pathname === '/' || pathname === loginPath) {
    return NextResponse.redirect(new URL(dashboardPath, req.url));
  }

  // --- C-2. 直接入力および無効なアドレスへのアクセス制御 ---
  // 公開ルート（メールリンク等）ではなく、かつ定義された有効な生徒ルート（ホワイトリスト）にも前方一致しない場合
  const isValidStudentRoute = VALID_STUDENT_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));

  if (!isPublicRoute && !isValidStudentRoute) {
    logger.info('proxy:invalid_route_redirect', `Invalid path direct access redirected to dashboard: ${pathname}`, {
      userId: user.id,
      email: user.email,
      path: pathname,
    });
    return NextResponse.redirect(new URL(dashboardPath, req.url));
  }

  // --- D. アクセスログの記録 ---
  // Server Action (POSTリクエスト) は proxy:page_view ログから完全に除外する
  // これにより、通信頻度の高い学習中の実績同期ログが画面アクセスログと混ざるのを防ぐ
  const isPageAccess = req.method === 'GET';
  if (isPageAccess && !isPublicRoute && user) {
    logger.info('page_view', `Access: ${pathname}`, {
      userId: user.id,
      email: user.email,
      path: pathname,
      payload: {
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