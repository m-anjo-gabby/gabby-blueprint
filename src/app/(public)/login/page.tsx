// src/app/(public)/login/page.tsx
'use client';

import { signIn } from '@/actions/authAction';
import { useState } from 'react';
import Image from 'next/image';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { LoginButton } from './_components/LoginButton';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // loadingステートを手動で管理する必要がなくなります
  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const result = await signIn(formData);
    
    // エラーハンドリング（サインイン処理内の成功時はリダイレクト）
    if (result && result.error) {
      setError(result.error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-8">
        
        {/* ログインカード */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <div className="text-center space-y-4 mb-8">
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
            <p className="text-xs text-slate-500">登録済みアカウントでログインしてください</p>
          </div>

          <form action={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              {/* メールアドレス */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 ml-1 uppercase tracking-wider">メールアドレス</label>
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
                <label className="text-xs font-bold text-slate-700 ml-1 uppercase tracking-wider">パスワード</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"} // ここで切り替え
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-base"
                  />

                  {/* 表示/非表示 切り替えボタン */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                    tabIndex={-1} // タブ移動で飛ばされないように設定
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2 text-red-600">
                <span className="text-xs font-medium">{error}</span>
              </div>
            )}

            {/* ログインボタンコンポーネントを使用 */}
            <LoginButton />
          </form>
        </div>

        <p className="text-center text-[10px] text-slate-400 tracking-widest uppercase">
          &copy; {new Date().getFullYear()} Gabby All rights reserved.
        </p>
      </div>
    </div>
  );
}