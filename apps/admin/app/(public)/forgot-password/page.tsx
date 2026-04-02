// src/app/(public)/forgot-password/page.tsx
'use client';

import { useState } from 'react';
import { forgotPassword } from '@/actions/adminAuthAction';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    setLoading(true);
    setError(null);
    const result = await forgotPassword(formData);
    setLoading(false);
    
    if (result.error) setError(result.error);
    else setSuccess(true);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-800">パスワードのリセット</h1>
          <p className="text-sm text-slate-500 mt-2">登録時のメールアドレスを入力してください。リセット手順を送信します。</p>
        </div>

        {!success ? (
          <form action={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 ml-1 uppercase tracking-wider">メールアドレス</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  name="email"
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  placeholder="account@example.com"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button 
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "送信する"}
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
        ) : (
          <div className="text-center space-y-6 py-4">
            <div className="text-green-600 font-medium">メールを送信しました。</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              受信トレイを確認し、記載されたリンクからパスワードを更新してください。
            </p>
            <Link href="/login" className="flex items-center justify-center gap-2 text-indigo-600 font-bold hover:underline">
              <ArrowLeft size={16} /> ログイン画面へ戻る
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}