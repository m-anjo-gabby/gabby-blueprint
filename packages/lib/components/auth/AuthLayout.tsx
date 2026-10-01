'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail } from 'lucide-react';

/**
 * 認証画面（ログイン・パスワード忘れ・再設定・招待）の共通レイアウト部品
 */

const COPYRIGHT = `© ${new Date().getFullYear()} Gabby All rights reserved.`;

/** 画面全体（中央寄せのカード＋コピーライト） */
export function AuthPage({ children, header }: { children: ReactNode; header?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 min-h-[340px] flex flex-col justify-center">
          {header}
          {children}
        </div>
        <p className="text-center text-[11px] text-slate-400">{COPYRIGHT}</p>
      </div>
    </div>
  );
}

/** カード内の1つの状態（AnimatePresence の直下で key を付けて使う） */
export function AuthStep({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** フォームの見出し */
export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-xl font-bold text-slate-800">{title}</h1>
      {description && <p className="text-sm text-slate-500 mt-2 leading-relaxed">{description}</p>}
    </div>
  );
}

const STATUS_ICON = {
  loading: { Icon: Loader2, wrap: '', icon: 'w-8 h-8 animate-spin text-brand' },
  info: { Icon: KeyRound, wrap: 'w-12 h-12 bg-brand-50 rounded-full', icon: 'w-6 h-6 text-brand' },
  success: { Icon: CheckCircle2, wrap: 'w-12 h-12 bg-emerald-50 rounded-full', icon: 'w-6 h-6 text-emerald-500' },
  warning: { Icon: AlertCircle, wrap: 'w-12 h-12 bg-amber-50 rounded-full', icon: 'w-6 h-6 text-amber-500' },
} as const;

/** アイコン・見出し・説明・操作を中央に並べた状態表示（確認中・完了・リンク切れ等） */
export function AuthStatus({
  tone,
  title,
  children,
  action,
}: {
  tone: keyof typeof STATUS_ICON;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { Icon, wrap, icon } = STATUS_ICON[tone];
  return (
    <div className="flex flex-col items-center text-center py-4" role={tone === 'loading' ? 'status' : undefined}>
      <div className={`flex items-center justify-center mb-4 ${wrap}`}>
        <Icon className={icon} aria-hidden />
      </div>
      <h1 className="text-xl font-bold text-slate-800">{title}</h1>
      {children && <p className="text-sm text-slate-500 mt-3 leading-relaxed max-w-xs">{children}</p>}
      {action && <div className="w-full mt-8">{action}</div>}
    </div>
  );
}

/** ボタンの見た目のリンク（完了・エラー画面の遷移用） */
export function AuthLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="w-full min-h-12 px-4 py-3 bg-brand hover:bg-brand-strong text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
    >
      {children}
    </Link>
  );
}

/** 「ログイン画面に戻る」等の控えめなリンク */
export function AuthBackLink({ href = '/login', children }: { href?: string; children: ReactNode }) {
  return (
    <div className="text-center">
      <Link
        href={href}
        className="text-xs text-slate-500 hover:text-brand transition-colors inline-flex items-center justify-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden /> {children}
      </Link>
    </div>
  );
}

/** メールアドレス欄 */
export function EmailField({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-bold text-slate-700 ml-1">
        {label}
      </label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
        <input
          id={id}
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-base"
          {...props}
        />
      </div>
    </div>
  );
}

/** フォーム全体のエラー表示 */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-100 flex items-center gap-2 text-rose-600">
      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
      <span className="text-xs font-medium">{message}</span>
    </div>
  );
}
