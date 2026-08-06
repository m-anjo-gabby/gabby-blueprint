'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PasswordInput } from '@gabby/lib/components/common/PasswordInput';
import { Loader2, ArrowLeft, CheckCircle2, AlertCircle, KeyRound, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { createBrowserClient } from '@gabby/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { resetPassword } from '@/actions/coachAuthAction';
import { useToast } from '@gabby/lib/hooks/useToast';

// 'guide' ステートを追加し、プリフェッチによる自動検証を防ぐユーザーインタラクション層を確立
type PageViewStatus = 'initializing' | 'guide' | 'form' | 'success' | 'error';

// useSearchParams() を安全に使用するための内部フォームコンポーネント
function UpdatePasswordForm() {
  const [viewStatus, setViewStatus] = useState<PageViewStatus>('initializing');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();
  const { showToast } = useToast();

  // アンマウント後のタイマー実行を安全にクリーンアップするための参照
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 現在のviewStatusを更新関数内で最新参照するためのref
  const statusRef = useRef<PageViewStatus>('initializing');

  // URLからトークンハッシュ情報を取得
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  // refの値を常に最新に同期
  useEffect(() => {
    statusRef.current = viewStatus;
  }, [viewStatus]);

  useEffect(() => {
    // 招待/リセットのハッシュトークンを確実に処理するための監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // パスワード更新成功（success）のときは、セッション変化があってもformに戻さないようにガード
      if (session && statusRef.current !== 'success') {
        setViewStatus('form');
      }
    });

    // 既にCookie等でセッションがある場合も考慮して即時チェック
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (session) {
        // すでに正常セッションがある場合はフォームを表示
        if (statusRef.current !== 'success') {
          setViewStatus('form');
        }
      } else {
        // セッションがなく、かつURLにrecovery用トークンがある場合は自動検証せずガイド画面へ案内
        if (tokenHash && type === 'recovery') {
          setViewStatus('guide');
        } else if (error) {
          setViewStatus('error');
        } else {
          // トークンもセッションもない場合は5秒待たずに即時エラーへ
          setViewStatus('error');
        }
      }
    });

    // 5秒経ってもセッションが来ない場合は、セッションエラーとして扱う
    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        // ガイド画面で待機している場合、または既に成功している場合はタイマーによるエラー遷移をスキップ
        if (!session && statusRef.current !== 'guide' && statusRef.current !== 'success') {
          setViewStatus('error');
        }
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [supabase, tokenHash, type]);

  // ユーザーが明示的にボタンをタップした時に実行される検証ハンドラ
  const handleStartReset = async () => {
    if (!tokenHash) {
      setViewStatus('error');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });

      if (verifyError) {
        setViewStatus('error');
      }
      // 成功時は onAuthStateChange がセッションを検知し、自動的に 'form' へ遷移します
    } catch {
      setViewStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;

    // 💡 共通ポリシーの強度（8文字以上、英数混在）に合わせてフロント側も同期
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    const hasAlpha = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasAlpha || !hasNumber) {
      setError('Password must contain both letters and numbers.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // クライアントサイドSDKによる直接更新を廃止し、バックエンドの安全なコアロジックを通過させる
      const result = await resetPassword(formData);

      if (result.error) {
        setError(result.error);
        showToast('Failed to update your password.', 'error');
        setLoading(false);
      } else {
        setViewStatus('success');
        setLoading(false);

        // 少し余韻を持たせてからログインへ（クリーンアップを保証）
        redirectTimerRef.current = setTimeout(() => {
          router.push('/login?message=updated');
        }, 1500);
      }
    } catch {
      setError('A network error occurred.');
      setLoading(false);
    }
  };

  return (
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
            <p className="text-slate-600 font-medium">Verifying your credentials...</p>
            <p className="text-xs text-slate-400 mt-2">Establishing a secure session.</p>
          </motion.div>
        )}

        {/* 【追加】1.5 プリフェッチ対策用案内画面（ユーザーのタップを待つ） */}
        {viewStatus === 'guide' && (
          <motion.div
            key="guide"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex flex-col items-center text-center py-4"
          >
            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6 text-indigo-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">Reset your password</h1>
            <p className="text-sm text-slate-500 mt-3 mb-8 leading-relaxed max-w-xs">
              You&apos;ve arrived from a verification link.<br />Press the button below to start setting a new password.
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={handleStartReset}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
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
              <h1 className="text-xl font-bold text-slate-800">Set a new password</h1>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                To keep your coach account secure, please enter a new password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <PasswordInput
                label="New Password"
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
                  'Update password & sign in'
                )}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-xs text-slate-500 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft size={14} /> Back to sign in
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
            <h1 className="text-xl font-bold text-slate-800">Password updated</h1>
            <p className="text-sm text-slate-500 mt-3 mb-8 leading-relaxed max-w-xs">
              Redirecting you to sign in shortly.
            </p>
            <Link
              href="/login?message=updated"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px]"
            >
              Go to sign in <ArrowLeft size={16} className="rotate-180" />
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
            <h1 className="text-xl font-bold text-slate-800">Session invalid</h1>
            <p className="text-sm text-slate-500 mt-3 mb-8 leading-relaxed max-w-xs">
              Your password reset link has expired or could not be verified. Please request a new one.
            </p>
            <Link
              href="/forgot-password"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px]"
            >
              Request a new reset link
            </Link>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      {/* Vercelビルドエラー（Missing Suspense with CSR Bailout）を防ぐためのSuspense境界 */}
      <Suspense fallback={
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 min-h-[340px] flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
          <p className="text-slate-600 font-medium">Loading...</p>
        </div>
      }>
        <UpdatePasswordForm />
      </Suspense>
    </div>
  );
}
