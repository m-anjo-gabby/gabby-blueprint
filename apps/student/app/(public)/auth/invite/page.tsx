// src/app/(public)/auth/invite/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@gabby/lib/supabase/client';
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

type ErrorStatus = 'loading' | 'expired' | 'error';

export default function InvitePage() {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [status, setStatus] = useState<ErrorStatus>('loading');

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
          setStatus('expired');
          return;
        }

        if (accessToken && refreshToken) {
          // 💡 開発環境での正常系UIテスト用の特別なダミートークン判定
          if (process.env.NODE_ENV === 'development' && accessToken === 'dummy_success_token') {
            console.log('[Debug] 正常系UIのモックモードが有効です。');
            setStatus('loading');
            return;
          }

          // 💡 不正な文字列による Supabase 内部の console.error を未然に防ぐガード節
          const isInvalidJWT = accessToken.split('.').length !== 3;
          
          if (isInvalidJWT) {
            setStatus('error');
          }

          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!error) {
            router.push('/update-password');
            return;
          }
          console.error('Error setting session:', error.message);
          setStatus('error');
          return;
        }
      }

      // 既存セッションの確認
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/update-password');
      } else {
        // セッションが取れない場合は期限切れとして扱う
        setStatus('expired');
      }
    };

    handleInvite();
  }, [supabase, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <AnimatePresence mode="wait">
          {status === 'loading' && <LoadingState key="loading" />}
          {(status === 'expired' || status === 'error') && (
            <ErrorState key="error" type={status} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ==========================================
// Sub Components (Clean Code & Separation)
// ==========================================

/**
 * ローディング状態のUIコンポーネント（パスワード忘れ画面のトーンに統一）
 */
function LoadingState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col items-center text-center"
    >
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
      <h1 className="text-xl font-bold text-slate-800">招待を確認しています</h1>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        Gabby Blueprint へようこそ。<br />安全なセッションを確立しています。少々お待ちください...
      </p>
    </motion.div>
  );
}

/**
 * エラー・期限切れ状態のUIコンポーネント（パスワード忘れ画面のトーンに統一）
 */
function ErrorState({ type }: { type: 'expired' | 'error' }) {
  const isExpired = type === 'expired';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col items-center text-center"
    >
      <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-500" />
      </div>

      <h1 className="text-xl font-bold text-slate-800">
        {isExpired ? '招待リンクの期限切れ' : '認証エラーが発生しました'}
      </h1>
      
      <p className="text-sm text-slate-500 mt-3 mb-8 leading-relaxed">
        {isExpired
          ? 'この招待リンクは有効期限が切れているか、すでに使用されています。管理者に新しい招待メールの発行を依頼してください。'
          : '招待セッションの作成中に予期せぬエラーが発生しました。もう一度メールのリンクをクリックするか、管理者にお問い合わせください。'}
      </p>

      <Link
        href="/login"
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
      >
        ログイン画面へ戻る
        <ArrowRight className="w-4 h-4" />
      </Link>
    </motion.div>
  );
}