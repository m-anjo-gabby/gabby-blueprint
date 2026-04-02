'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@/components/common/PasswordInput';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { createBrowserClient } from '@gabby/lib/supabase/client';

export default function UpdatePasswordPage() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createBrowserClient();

  useEffect(() => {
    // 招待/リセットのハッシュトークンを確実に処理するための監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth Event:", event);
      
      // sessionが取得できれば、更新画面を表示して良い状態
      if (session) {
        setIsInitializing(false);
      }
    });

    // 既にCookie等でセッションがある場合も考慮して即時チェック
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsInitializing(false);
    });

    // 5秒経ってもセッションが来ない場合は、リンク切れか無効なアクセスとして扱う
    const timer = setTimeout(() => {
      setIsInitializing(false);
      // ここで session がなければ UI側で「リンク無効」と出しても良い
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
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
        console.error("Update Error:", updateError);
        setError(updateError.message === 'New password should be different from the old password' 
          ? '新しいパスワードは以前と同じものは使用できません。' 
          : updateError.message);
        setLoading(false);
      } else {
        // 成功時
        setIsSuccess(true);
        // 少し余韻を持たせてからログインへ（即リダイレクトよりUXが良い）
        setTimeout(() => {
          router.push('/login?message=updated');
        }, 1500);
      }
    } catch (err) {
      console.error("Unexpected Error:", err);
      setError('通信エラーが発生しました。');
      setLoading(false);
    }
  };

  // 1. 初期化中（ハッシュトークン処理中）の表示
  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="mt-4 text-slate-600 font-medium">認証情報を確認中...</p>
      </div>
    );
  }

  // 2. 更新成功時の表示
  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-800">更新完了</h1>
        <p className="text-slate-500 mt-2">ログイン画面へ移動しています...</p>
      </div>
    );
  }

  // 3. メインのフォーム表示
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-800">新しいパスワードの設定</h1>
          <p className="text-sm text-slate-500 mt-2">
            アカウントを有効化するため、新しいパスワードを入力してください。
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
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'パスワードを更新してログイン'}
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
      </div>
    </div>
  );
}