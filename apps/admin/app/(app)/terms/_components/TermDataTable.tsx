'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { TermListItem } from '@gabby/types/term';
import { deleteTerm } from '@/actions/adminTermAction';
import { DataTable } from '@/components/list/DataTable';
import { boldChunks, DeleteConfirmDialog } from '@/components/list/DeleteConfirmDialog';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { createColumns } from './columns';

interface TermDataTableProps {
  data: TermListItem[];
  totalCount: number;
  pageCount: number;
}

export function TermDataTable({ data, totalCount, pageCount }: TermDataTableProps) {
  const t = useTranslations('terms.table');
  const tTerms = useTranslations('terms');
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
      <ListToolbar
        query={query}
        searchPlaceholder={t('searchPlaceholder')}
        totalCount={totalCount}
        pageCount={pageCount}
      />
      <DataTable
        columns={createColumns(t, { termTypeLabel, onDelete: setDeleting })}
        data={data}
        getRowId={(row) => row.term_id}
        emptyMessage={t('noData')}
        pending={query.isPending || isDeleting}
      />

      <DeleteConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('deleteDialogTitle')}
        description={(term) =>
          t.rich('deleteDialogBody', { termType: termTypeLabel(term), version: term.version_name, bold: boldChunks })
        }
        confirmLabel={t('deleteConfirm')}
      />
    </div>
  );
}
