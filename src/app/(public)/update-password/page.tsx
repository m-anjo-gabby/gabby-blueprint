// src/app/(public)/update-password/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resetPassword } from '@/actions/authAction';
import { PasswordInput } from '@/components/common/PasswordInput';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function UpdatePasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (formData: FormData) => {
    setLoading(true);
    setError(null);

    const result = await resetPassword(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push('/login');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-800">新しいパスワードの設定</h1>
          <p className="text-sm text-slate-500 mt-2">
            新しいパスワードを入力してください。
          </p>
        </div>

        <form action={handleSubmit} className="space-y-6">
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
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'パスワードを更新'}
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