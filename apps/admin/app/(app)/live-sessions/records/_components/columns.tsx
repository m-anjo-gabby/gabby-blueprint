'use client';

import type { useTranslations } from 'next-intl';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { REPORTING_TIMEZONE } from '@gabby/lib/date/reporting';
import type { AdminSessionRecord } from '@gabby/types/adminLiveSession';
import { SESSION_STATUS } from '@gabby/types/session';
import type { ListColumnDef } from '@/components/list/listTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAdminSessionStatusBadge } from '@/constants/session';
import { SessionOutcomeFlags } from '../../_components/SessionOutcomeFlags';

type TableT = ReturnType<typeof useTranslations<'liveSessions.records'>>;
type StatusT = ReturnType<typeof useTranslations<'liveSessions.status'>>;

interface ColumnOptions {
  tStatus: StatusT;
  onCorrect: (record: AdminSessionRecord) => void;
}

export function createColumns(t: TableT, { tStatus, onCorrect }: ColumnOptions): ListColumnDef<AdminSessionRecord>[] {
  return [
    {
      accessorKey: 'start_datetime',
      header: t('startHeader'),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-slate-600">
          {formatDateTimeByZone(row.original.start_datetime, REPORTING_TIMEZONE, false)}
        </span>
      ),
    },
    {
      accessorKey: 'student_name',
      header: t('studentHeader'),
      cell: ({ row }) => <span className="font-bold text-slate-700">{row.original.student_name}</span>,
    },
    {
      accessorKey: 'coach_name',
      header: t('coachHeader'),
      cell: ({ row }) => <span className="text-slate-600">{row.original.coach_name}</span>,
    },
    {
      id: 'result',
      header: t('resultHeader'),
      cell: ({ row }) => {
        const record = row.original;
        const badge =
          record.status === SESSION_STATUS.SCHEDULED
            ? { label: tStatus('unrecorded'), className: 'bg-amber-50 text-amber-700 border-amber-200' }
            : getAdminSessionStatusBadge(record, tStatus);
        return (
          <div className="space-y-1">
            <Badge variant="outline" className={`${badge.className} text-[10px] font-bold`}>
              {badge.label}
            </Badge>
            <SessionOutcomeFlags
              conductedVia={record.conducted_via}
              outcomeMismatch={record.outcome_mismatch}
              isCorrected={record.is_corrected}
            />
          </div>
        );
      },
    },
    {
      id: 'note',
      header: t('noteHeader'),
      meta: { className: 'hidden lg:table-cell' },
      cell: ({ row }) => {
        const note = row.original.status_note ?? row.original.cancel_reason;
        return note ? (
          <p className="max-w-xs truncate text-xs text-slate-500" title={note}>
            {note}
          </p>
        ) : (
          <span className="text-xs text-slate-300">-</span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          {row.original.needs_review && (
            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold">
              {t('reviewBadge')}
            </Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-3 border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={() => onCorrect(row.original)}
          >
            {row.original.status === SESSION_STATUS.SCHEDULED ? t('recordButton') : t('correctButton')}
          </Button>
        </div>
      ),
    },
  ];
}
