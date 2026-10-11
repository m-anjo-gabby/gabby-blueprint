'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { NOTICE_TYPES, type AdminNoticeListItem } from '@gabby/types/notice';
import { useToast } from '@gabby/lib/hooks/useToast';
import { deleteNotice } from '@/actions/adminNoticeAction';
import { DataTable } from '@/components/list/DataTable';
import { ListSelectFilter } from '@/components/list/ListSelectFilter';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
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
import { NOTICE_LIST_FILTERS } from '../_lib/list';
import { createColumns } from './columns';

const NOTICE_TYPE_OPTIONS = Object.entries(NOTICE_TYPES).map(([value, { label }]) => ({ value, label }));

interface NoticeDataTableProps {
  data: AdminNoticeListItem[];
  totalCount: number;
  pageCount: number;
}

export function NoticeDataTable({ data, totalCount, pageCount }: NoticeDataTableProps) {
  const t = useTranslations('notice.table');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const query = useListQuery(NOTICE_LIST_FILTERS);
  const [deleting, setDeleting] = useState<AdminNoticeListItem | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const handleDelete = (notice: AdminNoticeListItem) => {
    startDelete(async () => {
      try {
        const res = await deleteNotice(notice.notice_id);
        if (res.success) {
          showToast(t('toastDeleted'), 'success');
        } else {
          showToast(res.message || t('toastDeleteFailed'), 'error');
        }
      } catch {
        showToast(t('toastDeleteError'), 'error');
      }
    });
  };

  return (
    <div>
      <ListToolbar query={query} searchPlaceholder={t('searchPlaceholder')} totalCount={totalCount} pageCount={pageCount}>
        <ListSelectFilter
          label={t('typeHeader')}
          allLabel={t('allTypes')}
          options={NOTICE_TYPE_OPTIONS}
          value={query.filters.type}
          onChange={(value) => query.setFilter('type', value)}
        />
      </ListToolbar>
      <DataTable
        columns={createColumns(t, { onDelete: setDeleting })}
        data={data}
        getRowId={(row) => row.notice_id}
        emptyMessage={t('noData')}
        pending={query.isPending || isDeleting}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDialogBody')}</AlertDialogDescription>
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
