// src/app/(public)/forgot-password/page.tsx
'use client';

import { useState } from 'react';
import { forgotPassword } from '@/actions/adminAuthAction';
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

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
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 min-h-[340px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {!success ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <div className="mb-8">
                <h1 className="text-xl font-bold text-slate-800">パスワードのリセット</h1>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  管理アカウント登録時のメールアドレスを入力してください。リセット手順を送信します。
                </p>
              </div>

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
                      placeholder="admin@example.com"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-medium">
                    {error}
                  </div>
                )}

                <button 
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px]"
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
            </motion.div>
          ) : (
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
              <h1 className="text-xl font-bold text-slate-800">メールを送信しました</h1>
              <p className="text-sm text-slate-500 mt-3 mb-8 leading-relaxed max-w-xs">
                受信トレイを確認し、記載されたリンクからパスワードを更新してください。
              </p>
              <Link 
                href="/login" 
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px]"
              >
                <ArrowLeft size={16} /> ログイン画面へ戻る
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}