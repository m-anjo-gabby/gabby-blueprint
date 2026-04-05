// packages/lib/components/common/PasswordInput.tsx
'use client';

import { Eye, EyeOff, Lock } from 'lucide-react';
import { usePasswordVisibility } from '@gabby/lib/hooks/usePasswordVisibility';
import { InputHTMLAttributes } from 'react';

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function PasswordInput({ label, name = 'password', className = '', ...props }: PasswordInputProps) {
  const { isVisible, toggleVisibility, type } = usePasswordVisibility();

  return (
    <div className="space-y-2 w-full">
      {label && (
        <label className="text-xs font-bold text-slate-700 ml-1 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className={`relative group ${className}`}>
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
        
        <input
          name={name}
          type={type}
          className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-base"
          {...props}
        />

        <button
          type="button"
          onClick={toggleVisibility}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
          tabIndex={-1}
        >
          {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}