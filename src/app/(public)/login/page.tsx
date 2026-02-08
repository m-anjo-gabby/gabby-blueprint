'use client';

import { signIn } from '@/actions/authAction';
import { useState } from 'react';
import Image from 'next/image';
import { Loader2, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    setLoading(true);
    const result = await signIn(formData);
    if (result && result.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-100` space-y-8">
        


        {/* ログインカード */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
          {/* ロゴとタイトル */}
          <div className="text-center space-y-4 mb-4">
            <div className="flex justify-center">
              <Image 
                src="/logo-01.png" 
                alt="Gabby Mobile Logo" 
                width={320} 
                height={85} 
                className="h-auto w-auto max-w-60 md:max-w-[320px]"
                priority
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500">登録済みアカウントでサインインしてください</p>
            </div>
          </div>
          <form action={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              {/* メールアドレス */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 ml-1">メールアドレス</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="email"
                    type="email"
                    placeholder="account@example.com"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-base"
                  />
                </div>
              </div>

              {/* パスワード */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 ml-1">パスワード</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-base"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2 text-red-600">
                <span className="text-xs font-medium">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  認証中...
                </>
              ) : (
                'ログイン'
              )}
            </button>
          </form>
        </div>

        {/* フッター */}
        <p className="text-center text-[10px] text-slate-400 tracking-widest">
          &copy; {new Date().getFullYear()} Gabby All rights reserved.
        </p>
      </div>
    </div>
  );
}