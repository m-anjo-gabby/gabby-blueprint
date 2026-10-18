'use client';

import Link from 'next/link';
import type { ListColumnDef } from '@/components/list/listTable';
import type { useTranslations } from 'next-intl';
import { Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { CALENDAR_EVENT_TYPES, type CalendarEventItem } from '@gabby/types/calendarEvent';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { CalendarEventFormDialog, type CalendarEventFormOptions } from './CalendarEventFormDialog';

type TableT = ReturnType<typeof useTranslations<'calendarEvents.dataTable'>>;

/** 「参加者」ボタン（「編集」と同じ枠付きの小さいボタン） */
const PARTICIPANTS_BUTTON_CLASS = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  'h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50',
);

const BADGE_CLASS = 'text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border';

interface ColumnOptions {
  /**
   * シリーズの詳細で、同じシリーズの回だけを並べる場合。シリーズ名を出さず、
   * 参加者・アナウンス管理へのリンクに ?from=series を付けて戻り先をシリーズの詳細にする
   */
  hideSeries: boolean;
  /** 編集ダイアログの選択肢 */
  formOptions: CalendarEventFormOptions;
  onDelete: (event: CalendarEventItem) => void;
}

export function createColumns(
  t: TableT,
  { hideSeries, formOptions, onDelete }: ColumnOptions,
): ListColumnDef<CalendarEventItem>[] {
  return [
    {
      accessorKey: 'event_type',
      header: t('typeHeader'),
      cell: ({ row }) => {
        const badge = CALENDAR_EVENT_TYPES[row.original.event_type];
        return <span className={cn(BADGE_CLASS, badge.badgeClass)}>{badge.label}</span>;
      },
    },
    {
      accessorKey: 'title',
      header: t('titleHeader'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-bold text-slate-700">{row.original.title}</span>
          {!hideSeries && row.original.series && (
            <Link
              href={`/calendar-events/series/${row.original.series.series_id}`}
              className="block truncate text-xs text-slate-500 hover:text-brand"
            >
              {t('seriesPrefix', { title: row.original.series.title })}
            </Link>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'start_datetime',
      header: t('startDatetimeHeader'),
      cell: ({ row }) => (
        <span className="text-slate-600">{formatDateTimeByZone(row.original.start_datetime, 'Asia/Tokyo', false)}</span>
      ),
    },
    {
      id: 'coaches',
      header: t('coachHeader'),
      cell: ({ row }) => {
        const coaches = row.original.coaches ?? [];
        if (coaches.length === 0) return <span className="text-slate-300">{t('noCoach')}</span>;
        return (
          <span className="text-xs text-slate-600">{coaches.map((c) => c.user_name || t('unnamed')).join(', ')}</span>
        );
      },
    },
    {
      accessorKey: 'is_published',
      header: t('publishStatusHeader'),
      cell: ({ row }) =>
        row.original.is_published ? (
          <span className={cn(BADGE_CLASS, 'bg-emerald-50 text-emerald-700 border-emerald-100')}>{t('published')}</span>
        ) : (
          <span className={cn(BADGE_CLASS, 'bg-slate-100 text-slate-500 border-slate-200')}>{t('draft')}</span>
        ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('actionsHeader')}</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          {/* 参加確認が無く担当コーチもいない行は、同じ幅の空きを取って「編集」「削除」の位置を他の行とそろえる */}
          {row.original.rsvp_enabled || (row.original.coaches?.length ?? 0) > 0 ? (
            <Link
              href={`/calendar-events/${row.original.calendar_event_id}/participants${hideSeries ? '?from=series' : ''}`}
              className={PARTICIPANTS_BUTTON_CLASS}
              title={t('manageParticipants')}
            >
              <Users size={14} /> {t('participantsButton')}
            </Link>
          ) : (
            <span className={cn(PARTICIPANTS_BUTTON_CLASS, 'invisible')} aria-hidden>
              <Users size={14} /> {t('participantsButton')}
            </span>
          )}

          <CalendarEventFormDialog mode="edit" initialData={row.original} options={formOptions} />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(row.original)}
            aria-label={t('deleteDialogTitle')}
            className="h-8 w-8 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];
}
