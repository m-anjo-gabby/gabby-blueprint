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
import { DeleteConfirmDialog, boldChunks } from '@/components/list/DeleteConfirmDialog';
import { createColumns } from './columns';

/** 検索の対象（日英の表示名・短い名前・IANA名） */
const toSearchText = (row: TimezoneMaster) =>
  `${row.display_name_ja} ${row.display_name_en} ${row.short_name_ja} ${row.short_name_en} ${row.timezone}`;

interface TimezoneDataTableProps {
  /** 全件（検索・ページ分けはブラウザ側で行う） */
  data: TimezoneMaster[];
}

export function TimezoneDataTable({ data }: TimezoneDataTableProps) {
  const t = useTranslations('timezones.table');
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
      } else if ('reason' in result && result.reason === 'in_use') {
        showToast(t('toastInUse'), 'error');
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

      <DeleteConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('deleteDialogTitle')}
        description={(timezone) => t.rich('deleteDialogBody', { name: locale === 'en' ? timezone.display_name_en : timezone.display_name_ja, bold: boldChunks })}
        confirmLabel={t('deleteConfirm')}
      />
    </div>
  );
}
