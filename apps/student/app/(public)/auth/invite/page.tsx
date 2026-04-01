// src/app/(public)/auth/invite/page.tsx
'use client';

import { useEffect, useState } from 'react'; // useStateを追加
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/client';
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function InvitePage() {
  const router = useRouter();
  const supabase = createClient();
  const [errorStatus, setErrorStatus] = useState<'loading' | 'expired' | 'error'>('loading');

  useEffect(() => {
    const handleInvite = async () => {
      const hash = window.location.hash;
      
      if (hash && hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const errorDescription = params.get('error_description');

        // URLにerrorが含まれている場合は有効期限切れの可能性が高い
        if (errorDescription?.includes('expired')) {
          setErrorStatus('expired');
          return;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!error) {
            router.push('/update-password');
            return;
          }
          console.error("Error setting session:", error.message);
        }
      }

      // 既存セッションの確認
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/update-password');
      } else {
        // セッションが取れない場合はエラー表示
        setErrorStatus('expired');
      }
    };

    handleInvite();
  }, [supabase, router]);

  // --- ローディング表示 ---
  if (errorStatus === 'loading') {
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

  // --- エラー・期限切れ表示 ---
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-lg border border-red-100 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">招待リンクの期限切れ</h1>
        <p className="text-slate-600 mt-3 mb-8">
          この招待リンクは有効期限が切れているか、すでに使用されています。管理者に新しい招待を依頼してください。
        </p>
        <Link 
          href="/login"
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
        >
          ログイン画面へ戻る
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}