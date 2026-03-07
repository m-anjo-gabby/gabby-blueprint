// src/app/(app)/auth/callback/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const handleAuth = async () => {
      // 1. URLのクエリパラメータから情報を取得（PKCE/リセット用）
      const code = searchParams.get('code');
      const next = searchParams.get('next') ?? '/dashboard';

      if (code) {
        // リセットメール（PKCE）の場合はここでセッションを確立
        await supabase.auth.exchangeCodeForSession(code);
      }

      // 2. 招待メール（ハッシュトークン）の場合
      // クライアントサイドSDKがURLの #access_token を自動で読み取って、
      // セッションを確立（Cookieへの保存も含む）してくれるのを待機する
      const { data: { session }, error } = await supabase.auth.getSession();

      if (session) {
        // セッションが確立されたら指定のページ（/update-password）へ
        router.push(next);
      } else {
        console.error("Session matching failed:", error);
        // 万が一セッションが取れなかったらログインへ
        router.push('/login?error=session_not_found');
      }
    };

    handleAuth();
  }, [searchParams, router, supabase]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      <p className="mt-4 text-slate-600 font-medium">認証を完了させています...</p>
    </div>
  );
}