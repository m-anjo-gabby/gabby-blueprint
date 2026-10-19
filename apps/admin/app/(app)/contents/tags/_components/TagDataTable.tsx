'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useToast } from '@gabby/lib/hooks/useToast';
import { TAG_TYPES, type ContentTag } from '@gabby/types/content';
import { deleteTag } from '@/actions/adminTagAction';
import { DataTable } from '@/components/list/DataTable';
import { boldChunks, DeleteConfirmDialog } from '@/components/list/DeleteConfirmDialog';
import { ListSelectFilter } from '@/components/list/ListSelectFilter';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { paginateLocally } from '@/lib/list';
import { TAG_LIST_FILTERS } from '../_lib/list';
import { createColumns } from './columns';

const TAG_TYPE_OPTIONS = Object.entries(TAG_TYPES).map(([value, { label }]) => ({ value, label }));

/** 検索の対象（タグ名・タグID） */
const toSearchText = (tag: ContentTag) => `${tag.tag_name} ${tag.tag_id}`;

interface TagDataTableProps {
  /** 全件（タグはマスタで件数が少ないため、検索・絞り込み・ページ分けはブラウザ側で行う） */
  data: ContentTag[];
}

export function TagDataTable({ data }: TagDataTableProps) {
  const t = useTranslations('contents.tags.table');
  const { showToast } = useToast();
  const query = useListQuery(TAG_LIST_FILTERS, { shallow: true });
  const typed = query.filters.type ? data.filter((tag) => tag.tag_type === query.filters.type) : data;
  const list = paginateLocally(typed, query, toSearchText);
  const [deleting, setDeleting] = useState<ContentTag | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const handleDelete = (tag: ContentTag) => {
    startDelete(async () => {
      const result = await deleteTag(tag.tag_id);
      showToast(result.success ? t('toastDeleted') : t('toastDeleteFailed'), result.success ? 'success' : 'error');
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
      >
        <ListSelectFilter
          label={t('typeHeader')}
          allLabel={t('allTypes')}
          options={TAG_TYPE_OPTIONS}
          value={query.filters.type}
          onChange={(value) => query.setFilter('type', value)}
        />
      </ListToolbar>
      <DataTable
        columns={createColumns(t, { onDelete: setDeleting })}
        data={list.rows}
        getRowId={(row) => row.tag_id}
        emptyMessage={t('noData')}
        pending={isDeleting}
      />

      <DeleteConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('deleteDialogTitle')}
        description={(tag) => (
          <>
            {t.rich('deleteDialogBody', { name: tag.tag_name, bold: boldChunks })}
            <br />
            {t('deleteDialogHint')}
          </>
        )}
        confirmLabel={t('deleteConfirmButton')}
      />
    </div>
  );
}
