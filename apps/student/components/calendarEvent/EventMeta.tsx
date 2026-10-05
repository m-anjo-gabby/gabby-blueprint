import { UserRound } from 'lucide-react';
import type { CalendarEventItem } from '@gabby/types/calendarEvent';
import { cn } from '@/lib/utils';

/** 担当コーチの表示名（「Suzanne・Nao」）。未設定なら null */
export function formatEventCoachNames(event: Pick<CalendarEventItem, 'coaches'>): string | null {
  const names = (event.coaches ?? []).map((c) => c.user_name).filter((name): name is string => !!name);
  return names.length > 0 ? names.join('・') : null;
}

/** シリーズ名（シリーズに属する回のみ。各回のタイトルの上に小さく出す） */
export function EventSeriesLabel({ event, className }: { event: Pick<CalendarEventItem, 'series'>; className?: string }) {
  if (!event.series) return null;
  return <p className={cn('truncate text-xs text-ink-muted', className)}>{event.series.title}</p>;
}

/** 担当コーチ（未設定なら出さない） */
export function EventCoachLine({ event, className }: { event: Pick<CalendarEventItem, 'coaches'>; className?: string }) {
  const names = formatEventCoachNames(event);
  if (!names) return null;
  return (
    <p className={cn('flex items-center gap-1 text-xs text-ink-muted', className)}>
      <UserRound size={12} className="shrink-0" />
      <span className="truncate">コーチ：{names}</span>
    </p>
  );
}
