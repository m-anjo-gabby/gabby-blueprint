'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { TermListItem } from '@gabby/types/term';
import { useToast } from '@gabby/lib/hooks/useToast';
import { deleteTerm } from '@/actions/adminTermAction';
import { DataTable } from '@/components/list/DataTable';
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
import { createColumns } from './columns';

interface TermDataTableProps {
  data: TermListItem[];
  totalCount: number;
  pageCount: number;
}

export function TermDataTable({ data, totalCount, pageCount }: TermDataTableProps) {
  const t = useTranslations('terms.table');
  const tTerms = useTranslations('terms');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const query = useListQuery();
  const [deleting, setDeleting] = useState<TermListItem | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const termTypeLabel = (term: TermListItem) =>
    term.term_type === 'TERMS' ? tTerms('common.termTypeTerms') : tTerms('common.termTypePrivacy');

  const handleDelete = (term: TermListItem) => {
    startDelete(async () => {
      try {
        const result = await deleteTerm(term.term_id);
        if (result.success) {
          showToast(t('toastDeleted'), 'success');
        } else {
          showToast(tTerms(`errors.${result.errorCode}`), 'error');
        }
      } catch {
        showToast(t('toastUnexpectedError'), 'error');
      }
    });
  };

  return (
    <div>
      <ListToolbar query={query} searchPlaceholder={t('searchPlaceholder')} totalCount={totalCount} pageCount={pageCount} />
      <DataTable
        columns={createColumns(t, { termTypeLabel, onDelete: setDeleting })}
        data={data}
        getRowId={(row) => row.term_id}
        emptyMessage={t('noData')}
        pending={query.isPending || isDeleting}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting &&
                t.rich('deleteDialogBody', {
                  termType: termTypeLabel(deleting),
                  version: deleting.version_name,
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
