'use client';

import { signIn } from '@/actions/coachAuthAction';
import { useState } from 'react';
import Image from 'next/image';
import { Mail } from 'lucide-react';
import { LoginButton } from './_components/LoginButton';
import ConfirmContainer from '@gabby/lib/components/common/ConfirmContainer';
import { PasswordInput } from '@gabby/lib/components/common/PasswordInput';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const result = await signIn(formData);

    if (result && result.error) {
      setError(result.error);
      setPassword('');
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
                alt="Gabby Blueprint Logo"
                width={320}
                height={85}
                className="h-auto w-auto max-w-60 md:max-w-[320px]"
                priority
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">Coach Portal</p>
              <p className="text-xs text-slate-500">コーチ用アカウントでログインしてください</p>
            </div>
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="coach@example.com"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-base"
                  />
                </div>
              </div>

              {/* パスワード */}
              <div className="space-y-2">
                <PasswordInput
                  label="パスワード"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2 text-red-600">
                <span className="text-xs font-medium">{error}</span>
              </div>
            )}

            <LoginButton />
          </form>
        </div>

        <p className="text-center text-[10px] text-slate-400 tracking-widest uppercase">
          &copy; {new Date().getFullYear()} Gabby All rights reserved.
        </p>
      </div>
      <ConfirmContainer />
    </div>
  );
}
