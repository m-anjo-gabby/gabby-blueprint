'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useToast } from '@gabby/lib/hooks/useToast';
import { deleteKnowledgeEntry, type KnowledgeEntry } from '@/actions/aiKnowledgeBaseAction';
import { DataTable } from '@/components/list/DataTable';
import { boldChunks, DeleteConfirmDialog } from '@/components/list/DeleteConfirmDialog';
import { ListSelectFilter } from '@/components/list/ListSelectFilter';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { getKnowledgeSourceTypeOptions } from '../_lib/knowledgeSourceTypes';
import { KNOWLEDGE_LIST_FILTERS } from '../_lib/list';
import { createColumns } from './columns';

interface KnowledgeEntryDataTableProps {
  data: KnowledgeEntry[];
  totalCount: number;
  pageCount: number;
}

export function KnowledgeEntryDataTable({ data, totalCount, pageCount }: KnowledgeEntryDataTableProps) {
  const t = useTranslations('tools.aiKnowledgeBase.list');
  const tSourceTypes = useTranslations('tools.aiKnowledgeBase.sourceTypes');
  const sourceTypeOptions = getKnowledgeSourceTypeOptions(tSourceTypes);
  const { showToast } = useToast();
  const query = useListQuery(KNOWLEDGE_LIST_FILTERS);
  const [deleting, setDeleting] = useState<KnowledgeEntry | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const handleDelete = (entry: KnowledgeEntry) => {
    startDelete(async () => {
      const result = await deleteKnowledgeEntry(entry.knowledge_id);
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
        totalCount={totalCount}
        pageCount={pageCount}
      >
        <ListSelectFilter
          label={t('typeHeader')}
          allLabel={t('allTypes')}
          options={sourceTypeOptions}
          value={query.filters.type}
          onChange={(value) => query.setFilter('type', value)}
        />
      </ListToolbar>
      <DataTable
        columns={createColumns(t, { sourceTypeOptions, onDelete: setDeleting })}
        data={data}
        getRowId={(row) => row.knowledge_id}
        emptyMessage={query.hasConditions ? t('emptyFiltered') : t('emptyRegistered')}
        pending={query.isPending || isDeleting}
      />

      <DeleteConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('deleteDialogTitle')}
        description={(entry) => t.rich('deleteDialogBody', { title: entry.title, bold: boldChunks })}
        confirmLabel={t('deleteConfirm')}
      />
    </div>
  );
}
