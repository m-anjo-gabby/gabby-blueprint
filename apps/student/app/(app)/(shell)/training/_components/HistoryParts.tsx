import { Calendar, type LucideIcon } from 'lucide-react';

/** 履歴一覧の小さな数値表示（アイコン・ラベル・数値） */
export function HistoryMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
      <Icon size={14} className="shrink-0 text-brand-500" />
      {label}
      <span className="font-semibold text-ink tabular-nums">{value}</span>
    </span>
  );
}

/** 履歴が0件の月の表示 */
export function HistoryEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
      <Calendar size={32} className="mx-auto mb-3 text-ink-subtle" />
      <p className="text-sm font-semibold text-ink-muted">{message}</p>
    </div>
  );
}
