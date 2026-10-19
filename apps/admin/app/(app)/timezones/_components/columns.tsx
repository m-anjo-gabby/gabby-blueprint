'use client';

import { Trash2 } from 'lucide-react';
import type { useTranslations } from 'next-intl';
import type { TimezoneMaster } from '@gabby/types/timezone';
import { InactiveBadge } from '@/components/common/InactiveBadge';
import type { ListColumnDef } from '@/components/list/listTable';
import { Button } from '@/components/ui/button';
import { CurrentTimeCell } from './CurrentTimeCell';
import { TimezoneFormDialog } from './TimezoneFormDialog';

type TableT = ReturnType<typeof useTranslations<'timezones.table'>>;

interface ColumnOptions {
  locale: string;
  onDelete: (timezone: TimezoneMaster) => void;
}

export function createColumns(t: TableT, { locale, onDelete }: ColumnOptions): ListColumnDef<TimezoneMaster>[] {
  return [
    {
      accessorKey: 'sort_no',
      header: t('seqHeader'),
      cell: ({ row }) => <span className="font-mono text-slate-500">{row.original.sort_no}</span>,
    },
    {
      id: 'display_name',
      header: t('nameHeader'),
      cell: ({ row }) => {
        // 画面ロケールの名称を上段（太字）、もう一方を下段に表示
        const [primary, secondary] =
          locale === 'en'
            ? [row.original.display_name_en, row.original.display_name_ja]
            : [row.original.display_name_ja, row.original.display_name_en];
        return (
          <div className="flex flex-col">
            <span className="flex items-center gap-2 font-bold text-slate-700">
              {primary}
              {!row.original.is_active && <InactiveBadge label={t('inactiveBadge')} />}
            </span>
            <span className="text-xs text-slate-500">{secondary}</span>
          </div>
        );
      },
    },
    {
      id: 'short_name',
      header: t('shortNameHeader'),
      cell: ({ row }) => {
        const [primary, secondary] =
          locale === 'en'
            ? [row.original.short_name_en, row.original.short_name_ja]
            : [row.original.short_name_ja, row.original.short_name_en];
        return (
          <div className="flex flex-col">
            <span className="text-slate-700">{primary}</span>
            <span className="text-xs text-slate-500">{secondary}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'timezone',
      header: t('ianaHeader'),
      cell: ({ row }) => <span className="font-mono text-xs text-slate-500">{row.original.timezone}</span>,
    },
    {
      id: 'current_time',
      header: t('currentTimeHeader'),
      cell: ({ row }) => <CurrentTimeCell timezone={row.original.timezone} />,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('actionsHeader')}</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <TimezoneFormDialog mode="edit" initialData={row.original} />
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
