import { AlertCircle } from 'lucide-react';
import type { LoginNotice } from '../../hooks/useLoginNotice';

interface LoginNoticeBannerProps {
  notice: LoginNotice | null;
  messages: Record<LoginNotice, string>;
}

/** ログイン画面の上部に出す案内（`useLoginNotice` の結果を表示する） */
export function LoginNoticeBanner({ notice, messages }: LoginNoticeBannerProps) {
  if (!notice) return null;

  return (
    <div role="status" className="p-3 rounded-lg border flex items-center gap-2 bg-amber-50 border-amber-100 text-amber-700">
      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
      <span className="text-xs font-medium">{messages[notice]}</span>
    </div>
  );
}
