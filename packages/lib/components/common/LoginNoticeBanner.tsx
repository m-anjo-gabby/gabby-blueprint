import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { LoginNotice } from '../../hooks/useLoginNotice';

interface LoginNoticeBannerProps {
  notice: LoginNotice | null;
  messages: Record<LoginNotice, string>;
}

/** ログイン画面の上部に出す案内（`useLoginNotice` の結果を表示する） */
export function LoginNoticeBanner({ notice, messages }: LoginNoticeBannerProps) {
  if (!notice) return null;

  const isSuccess = notice === 'password_updated';
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      role="status"
      className={`p-3 rounded-lg border flex items-center gap-2 ${
        isSuccess ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-xs font-medium">{messages[notice]}</span>
    </div>
  );
}
