// apps\admin\app\(public)\update-password\page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@gabby/lib/components/common/PasswordInput';
import { Loader2, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { createBrowserClient } from '@gabby/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { resetPassword } from '@/actions/adminAuthAction'; 
import { useToast } from '@gabby/lib/hooks/useToast';

type PageViewStatus = 'initializing' | 'form' | 'success' | 'error';

export default function UpdatePasswordPage() {
  const [viewStatus, setViewStatus] = useState<PageViewStatus>('initializing');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createBrowserClient();
  const { showToast } = useToast();
  
  // アンマウント後のタイマー実行を安全にクリーンアップするための参照
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 招待/リセットのハッシュトークンを確実に処理するための監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth Event:", event);
      
      // sessionが取得できれば、更新画面を表示して良い状態
      if (session) {
        setViewStatus('form');
      }
    });

    // 既にCookie等でセッションがある場合も考慮して即時チェック
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (session) setViewStatus('form');
      else if (error) setViewStatus('error');
    });

    // 5秒経ってもセッションが来ない場合は、セッションエラーとして扱う
    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) setViewStatus('error');
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [supabase]);

  // 💡 React 19 に向けて FormEvent から SubmitEvent へ変更 (ts(6385)警告の回避)
  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;

    // 💡 共通ポリシーの強度（8文字以上、英数混在）に合わせてフロント側も同期
    if (!password || password.length < 8) {
      setError('パスワードは8文字以上で入力してください。');
      return;
    }

    const hasAlpha = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasAlpha || !hasNumber) {
      setError('パスワードには英字と数字を両方含めてください。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // クライアントサイドSDKによる直接更新を廃止し、バックエンドの安全なコアロジックを通過させる
      const result = await resetPassword(formData);

      if (result.error) {
        // 共通コアで翻訳された綺麗な日本語エラーメッセージがそのままセットされます
        setError(result.error);
        showToast('パスワードの更新に失敗しました。', 'error');
        setLoading(false);
      } else {
        // 成功時
        setViewStatus('success');
        setLoading(false);
        
        // 少し余韻を持たせてからログインへ（クリーンアップを保証）
        redirectTimerRef.current = setTimeout(() => {
          router.push('/login?message=updated');
        }, 1500);
      }
    } catch (err) {
      console.error("Unexpected Error:", err);
      setError('通信エラーが発生しました。');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 min-h-[340px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
          
          {/* 1. 初期化中 */}
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

          {/* 2. フォーム表示 */}
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
                  管理アカウントのセキュリティを確保するため、新しいパスワードを入力してください。
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <PasswordInput
                  label="新しいパスワード"
                  name="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                />

                {error && (
                  <p className="text-[11px] text-red-500 font-bold ml-1 animate-in fade-in slide-in-from-top-1">
                    {error}
                  </p>
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

          {/* 3. 更新成功時 */}
          {viewStatus === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex flex-col items-center text-center py-4"
            >
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-800">パスワードを更新しました</h1>
              <p className="text-sm text-slate-500 mt-3 mb-8 leading-relaxed max-w-xs">
                まもなく管理画面ログインへ移動します。
              </p>
              <Link
                href="/login?message=updated"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px]"
              >
                ログイン画面へ移動 <ArrowLeft size={16} className="rotate-180" />
              </Link>
            </motion.div>
          )}

          {/* 4. セッションエラー時（リンク切れ等） */}
          {viewStatus === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center text-center py-4"
            >
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-amber-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-800">セッションが無効です</h1>
              <p className="text-sm text-slate-500 mt-3 mb-8 leading-relaxed max-w-xs">
                パスワード設定リンクの有効期限が切れているか、正しく認証できませんでした。もう一度リセットメールの送信からやり直してください。
              </p>
              <Link
                href="/forgot-password"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px]"
              >
                再設定メールをリクエストする
              </Link>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}