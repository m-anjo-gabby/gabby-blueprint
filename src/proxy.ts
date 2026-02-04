import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function proxy(req: NextRequest) {
  // 1. レスポンスオブジェクトの作成
  // この時点でのレスポンスを生成し、後でCookieを書き込めるようにします
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  // 2. Supabaseクライアントの作成
  // 最新の getAll / setAll 方式で実装
  const supabase = createServerClient(
    supabaseUrl,
    publishableKey,
    {
      cookies: {
        getAll: () => {
          return req.cookies.getAll();
        },
        setAll: (cookiesToSet) => {
          // RequestのCookieを更新（Middleware内での後続処理用）
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          // ResponseのCookieを更新（ブラウザへの返却用）
          res = NextResponse.next({
            request: req,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 3. セッションの確認とリフレッシュ
  // これにより、期限切れが近いトークンが自動で更新されます
  await supabase.auth.getSession();

  // 4. 認証状態に応じたアクセス制御
  const loginPath = '/login';
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = req.nextUrl;

  const isLoginPage = pathname === loginPath;
  const isAuthRoute = pathname.startsWith('/auth'); // Callback等を除外

  // A. 未ログインの場合
  if (!user && !isLoginPage && !isAuthRoute) {
    // ログインページ以外にアクセス -> ログインへ
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  // B. ログイン済みの場合
  if (user) {
    // メタデータからロールを取得 (admin または student)
    // DB照会を伴わないため高速。SpringBootの SecurityContext 参照に近い挙動
    const role = user.app_metadata?.role as string | undefined;
    
    // ロールに基づいたデフォルトのダッシュボードパス
    const defaultDashboard = role === 'admin' ? '/admin/dashboard' : '/student/dashboard';

    // ログイン済みでログインページまたはルートにアクセス -> 適切なダッシュボードへ
    if (isLoginPage || pathname === '/') {
      return NextResponse.redirect(new URL(defaultDashboard, req.url));
    }

    // ロールベースのパスガード (RBAC: Role Based Access Control)
    // 管理者以外が /admin にアクセス -> 生徒用へ
    if (pathname.startsWith('/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL('/student/dashboard', req.url));
    }
    // 管理者が /student にアクセス -> 管理者用へ (必要に応じて)
    if (pathname.startsWith('/student') && role === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', req.url));
    }
  }

  return res;
}

// 5. ミドルウェアを適用するパスの設定
export const config = {
  matcher: [
    /*
     * 以下のパスを除いたすべてのリクエストにミドルウェアを適用
     * - _next/static (静的ファイル)
     * - _next/image (画像最適化)
     * - favicon.ico (ファビコン)
     * - 画像などの静的アセット
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};