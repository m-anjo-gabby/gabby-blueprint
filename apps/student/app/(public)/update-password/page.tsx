// src/app/(public)/update-password/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@gabby/lib/components/common/PasswordInput';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { createBrowserClient } from '@gabby/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

type PageViewStatus = 'initializing' | 'form' | 'success';

export default function UpdatePasswordPage() {
  const [viewStatus, setViewStatus] = useState<PageViewStatus>('initializing');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createBrowserClient();
  
  // アンマウント後のタイマー実行を防ぐための参照
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 招待/リセットのハッシュトークンを確実に処理するための監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth Event:', event);
      
      // sessionが取得できれば、更新画面を表示して良い状態
      if (session) {
        setViewStatus('form');
      }
    });

    // 既にCookie等でセッションがある場合も考慮して即時チェック
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setViewStatus('form');
    });

    // 5秒経ってもセッションが来ない場合は、リンク切れか無効なアクセスとして扱う
    const initTimer = setTimeout(() => {
      setViewStatus('form');
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(initTimer);
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;

    if (!password || password.length < 6) {
      setError('パスワードは6文字以上で入力してください。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // クライアントサイドSDKで直接更新
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        console.error('Update Error:', updateError);
        
        // 💡 [修正ポイント]: 文字列の完全一致ではなく、部分一致 (.includes) に変更することで
        // 大文字小文字の差異や細かな表記揺れ、前後の空白に影響されず、確実に日本語メッセージへ変換します
        const errorMsg = updateError.message || '';
        if (errorMsg.toLowerCase().includes('different from the old')) {
          setError('新しいパスワードは現在と同じものは使用できません。');
        } else {
          setError(updateError.message);
        }
        
        setLoading(false);
      } else {
        // 成功時
        setViewStatus('success');
        setLoading(false);
        
        // 自動遷移のスケジューリング（クリーンアップを保証）
        redirectTimerRef.current = setTimeout(() => {
          router.push('/login?message=updated');
        }, 2000);
      }
    } catch (err) {
      console.error('Unexpected Error:', err);
      setError('通信エラーが発生しました。');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      {/* 統一された外枠カード（画面のガタつきを抑える最小高さを設定） */}
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 min-h-[340px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
          
          {/* 1. 初期化中（認証情報確認中） */}
          {viewStatus === 'initializing' && (
            <motion.div
              key="initializing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex flex-col items-center text-center py-6"
            >
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
              <p className="text-slate-600 font-medium">認証情報を確認中...</p>
              <p className="text-xs text-slate-400 mt-2">安全なセッションを確立しています。</p>
            </motion.div>
          )}

          {/* 2. メインのフォーム表示 */}
          {viewStatus === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <div className="mb-8">
                <h1 className="text-xl font-bold text-slate-800">新しいパスワードの設定</h1>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  アカウントセキュリティを確保するため、新しいパスワードを入力してください。
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <PasswordInput
                  label="新しいパスワード"
                  name="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                />

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-medium">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px]"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'パスワードを更新してログイン'
                  )}
                </button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-xs text-slate-500 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1"
                  >
                    <ArrowLeft size={14} /> ログイン画面に戻る
                  </Link>
                </div>
              </form>
            </motion.div>
          )}

          {/* 3. 更新成功時（統一されたモダンデザイン） */}
          {viewStatus === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex flex-col items-center text-center py-4"
            >
              {/* アイコンコンテナの統一 */}
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>

              <h1 className="text-xl font-bold text-slate-800">パスワードを更新しました</h1>
              <p className="text-sm text-slate-500 mt-3 mb-8 leading-relaxed max-w-xs">
                まもなくログイン画面へ自動的に移動します。
              </p>

              {/* 明示的なフォールバックアクションボタン */}
              <Link
                href="/login?message=updated"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px]"
              >
                ログイン画面へ移動 <ArrowLeft size={16} className="rotate-180" />
              </Link>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}