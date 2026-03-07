'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/client';
import { Loader2 } from 'lucide-react';

export default function InvitePage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const handleInvite = async () => {
      // 1. URLのハッシュ (#access_token=...) から直接トークンを取得
      const hash = window.location.hash;
      
      if (hash && hash.includes('access_token=')) {
        // ハッシュ文字列を解析
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          // 2. Supabaseに手動でセッションをセット（これが一番確実）
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!error) {
            console.log("Session set successfully via hash");
            router.push('/update-password');
            return;
          }
          console.error("Error setting session:", error.message);
        }
      }

      // 3. すでにセッションがあるか（または自動認識されたか）確認
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/update-password');
      } else {
        // セッションがどうしても取れない場合、3秒後にログインへ（タイムアウト）
        const timer = setTimeout(() => {
          router.push('/login?error=invite_timeout');
        }, 3000);
        return () => clearTimeout(timer);
      }
    };

    handleInvite();
  }, [supabase, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="p-8 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
        <h1 className="text-lg font-bold text-slate-800">招待を確認しています</h1>
        <p className="text-sm text-slate-500 mt-2">セッションを確立しています。少々お待ちください...</p>
      </div>
    </div>
  );
}