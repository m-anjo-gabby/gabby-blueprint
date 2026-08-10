'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
          <h1 className="text-xl font-bold text-slate-800">Loading...</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Verifying your invitation link.
          </p>
        </div>
      </div>
    }>
      {children}
    </Suspense>
  );
}
