import { cn } from '@/lib/utils';
import { ImmersivePanel } from './PageFrames';

const TONE_CLASS = {
  brand: 'border-brand-100 bg-brand-50 text-brand',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-500',
  warning: 'border-amber-100 bg-amber-50 text-amber-500',
  error: 'border-rose-100 bg-rose-50 text-rose-500',
} as const;

const ACTION_CLASS = {
  primary: 'bg-brand text-white shadow-lg shadow-brand/10 hover:bg-brand-strong',
  secondary: 'border border-line bg-surface text-ink-soft hover:border-brand-200 hover:text-brand',
} as const;

/** ImmersiveNotice の actions に置くボタン・リンクの見た目（Link / button どちらにも付けられるよう class で渡す） */
export function noticeActionClass(variant: keyof typeof ACTION_CLASS = 'primary') {
  return cn(
    'flex h-12 w-full items-center justify-center gap-2 rounded-control text-sm font-bold transition-all active:scale-95',
    ACTION_CLASS[variant]
  );
}

interface ImmersiveNoticeProps {
  icon: React.ReactNode;
  tone?: keyof typeof TONE_CLASS;
  title: string;
  description?: React.ReactNode;
  /** 戻る・再開などの操作（`noticeActionClass()` を付けたボタン・リンク） */
  actions?: React.ReactNode;
}

/**
 * 没入画面の状態表示（教材なし・エラー・開始待ち等）。
 * プレイヤーと同じパネルの中央に表示するため、状態が切り替わっても枠が動かない。
 */
export function ImmersiveNotice({ icon, tone = 'brand', title, description, actions }: ImmersiveNoticeProps) {
  return (
    <ImmersivePanel className="items-center justify-center px-6 py-10 text-center animate-in fade-in duration-300">
      <div className="w-full max-w-sm space-y-6">
        <div className={cn('mx-auto flex h-16 w-16 items-center justify-center rounded-card border', TONE_CLASS[tone])}>
          {icon}
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
          {description && <p className="text-sm leading-relaxed text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="space-y-3">{actions}</div>}
      </div>
    </ImmersivePanel>
  );
}
