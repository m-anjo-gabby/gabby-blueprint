'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { CalendarEventItem } from '@gabby/types/calendarEvent';
import { useToast } from '@gabby/lib/hooks/useToast';
import { deleteCalendarEvent } from '@/actions/adminCalendarEventAction';
import { DataTable } from '@/components/list/DataTable';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { paginateLocally } from '@/lib/list';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { createColumns } from './columns';

/** 検索の対象（タイトル・シリーズ名） */
const toSearchText = (event: CalendarEventItem) => `${event.title} ${event.series?.title ?? ''}`;

interface CalendarEventDataTableProps {
  /** 全件（検索・ページ分けはブラウザ側で行う） */
  data: CalendarEventItem[];
  /** シリーズの詳細で、同じシリーズの回だけを並べる場合（columns.tsx の hideSeries） */
  hideSeries?: boolean;
}

export function CalendarEventDataTable({ data, hideSeries = false }: CalendarEventDataTableProps) {
  const t = useTranslations('calendarEvents.dataTable');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const query = useListQuery([], { shallow: true });
  const list = paginateLocally(data, query, toSearchText);
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
    <div>
      <ListToolbar
        query={query}
        searchPlaceholder={t('searchPlaceholder')}
        totalCount={list.totalCount}
        pageCount={list.pageCount}
        page={list.page}
      />
      <DataTable
        columns={createColumns(t, { hideSeries, onDelete: setDeleting })}
        data={list.rows}
        getRowId={(row) => row.calendar_event_id}
        emptyMessage={t('noData')}
        pending={isDeleting}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting &&
                t.rich('deleteDialogBody', {
                  title: deleting.title,
                  bold: (chunks) => <span className="font-bold text-slate-900">{chunks}</span>,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && handleDelete(deleting)} className="bg-rose-600 text-white hover:bg-rose-700">
              {t('deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
