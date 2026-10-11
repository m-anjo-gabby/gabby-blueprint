'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { TimezoneMaster } from '@gabby/types/timezone';
import { useToast } from '@gabby/lib/hooks/useToast';
import { deleteTimezone } from '@/actions/adminTimezoneAction';
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

/** 検索の対象（日英の表示名・IANA名） */
const toSearchText = (row: TimezoneMaster) => `${row.display_name_ja} ${row.display_name_en} ${row.timezone}`;

interface TimezoneDataTableProps {
  /** 全件（検索・ページ分けはブラウザ側で行う） */
  data: TimezoneMaster[];
}

export function TimezoneDataTable({ data }: TimezoneDataTableProps) {
  const t = useTranslations('timezones.table');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { showToast } = useToast();
  const query = useListQuery([], { shallow: true });
  const list = paginateLocally(data, query, toSearchText);
  const [deleting, setDeleting] = useState<TimezoneMaster | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const handleDelete = (timezone: TimezoneMaster) => {
    startDelete(async () => {
      const result = await deleteTimezone(timezone.timezone);
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
        columns={createColumns(t, { locale, onDelete: setDeleting })}
        data={list.rows}
        getRowId={(row) => row.timezone}
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
                  name: locale === 'en' ? deleting.display_name_en : deleting.display_name_ja,
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
