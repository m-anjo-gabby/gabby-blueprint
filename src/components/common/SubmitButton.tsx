// src/components/common/SubmitButton.tsx
'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface SubmitButtonProps {
  label: string;
  loadingLabel?: string;
  className?: string;
}

export function SubmitButton({ label, loadingLabel = '処理中...', className }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`
        w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2
        ${pending 
          ? 'bg-slate-200 text-slate-500 cursor-not-allowed' 
          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        } ${className}`}
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {loadingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}