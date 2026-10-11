'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { CalendarEventItem } from '@gabby/types/calendarEvent';
import { useToast } from '@gabby/lib/hooks/useToast';
import { deleteCalendarEvent } from '@/actions/adminCalendarEventAction';
import { DataTable } from '@/components/list/DataTable';
import { DeleteConfirmDialog, boldChunks } from '@/components/list/DeleteConfirmDialog';
import { createColumns } from './columns';

interface CalendarEventTableProps {
  data: CalendarEventItem[];
  /** シリーズの詳細で、同じシリーズの回だけを並べる場合（columns.tsx の hideSeries） */
  hideSeries?: boolean;
  /** 一覧を取り直している最中（条件の変更） */
  pending?: boolean;
  /** 上に ListToolbar を置かず単独で使う */
  standalone?: boolean;
}

/** カレンダーイベントの表と削除の確認（一覧・シリーズの詳細で共用） */
export function CalendarEventTable({ data, hideSeries = false, pending = false, standalone = false }: CalendarEventTableProps) {
  const t = useTranslations('calendarEvents.dataTable');
  const { showToast } = useToast();
  const [deleting, setDeleting] = useState<CalendarEventItem | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const handleDelete = (event: CalendarEventItem) => {
    startDelete(async () => {
      const result = await deleteCalendarEvent(event.calendar_event_id);
      if (result.success) {
        showToast(t('toastDeleted'), 'success');
      } else {
        showToast(result.message || t('toastDeleteFailed'), 'error');
      }
    });
  };

  return (
    <>
      <DataTable
        columns={createColumns(t, { hideSeries, onDelete: setDeleting })}
        data={data}
        getRowId={(row) => row.calendar_event_id}
        emptyMessage={t('noData')}
        pending={pending || isDeleting}
        standalone={standalone}
      />

      <DeleteConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('deleteDialogTitle')}
        description={(event) => t.rich('deleteDialogBody', { title: event.title, bold: boldChunks })}
        confirmLabel={t('deleteConfirm')}
      />
    </>
  );
}
