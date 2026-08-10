'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

export function LoginButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`
        w-full h-12 px-4 rounded-xl font-black text-[11px] uppercase tracking-[0.2em]
        transition-all duration-300 flex items-center justify-center gap-3
        ${pending
          ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-[0.98]'
        }
      `}
    >
      {pending ? (
        <>
          <div className="relative flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin stroke-[3px]" />
            <div className="absolute inset-0 w-4 h-4 border-2 border-indigo-600/20 rounded-full animate-ping" />
          </div>
          <span className="animate-pulse">Signing in...</span>
        </>
      ) : (
        'Sign In'
      )}
    </button>
  );
}
