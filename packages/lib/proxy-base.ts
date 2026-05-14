import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function createSupabaseProxy(req: NextRequest) {
  let res = NextResponse.next({
    request: { headers: req.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 元の「3. セッション確認」
  await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();

  // --- 共通ヘッダーの注入 ---
  if (user) {
    // リクエストヘッダー（Action側で headers() で取れる値）にセット
    res.headers.set('x-user-id', user.id);
    
    // 将来的な拡張の例
    // const requestId = crypto.randomUUID();
    // res.headers.set('x-request-id', requestId);
  }

  return { res, user, supabase };
}