'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { ContractPlan } from '@gabby/types/contract';
import { useToast } from '@gabby/lib/hooks/useToast';
import { deleteContractPlan } from '@/actions/adminContractAction';
import { DataTable } from '@/components/list/DataTable';
import { DeleteConfirmDialog, boldChunks } from '@/components/list/DeleteConfirmDialog';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { paginateLocally } from '@/lib/list';
import { createColumns } from './columns';

/** 検索の対象（プラン名（日英）・プランコード） */
const toSearchText = (plan: ContractPlan) => `${plan.plan_name} ${plan.plan_name_en ?? ''} ${plan.plan_code}`;

interface ContractPlanDataTableProps {
  /** 全件（プランはマスタで件数が少ないため、検索・ページ分けはブラウザ側で行う） */
  data: ContractPlan[];
}

export function ContractPlanDataTable({ data }: ContractPlanDataTableProps) {
  const t = useTranslations('contracts.plans.table');
  const { showToast } = useToast();
  const query = useListQuery([], { shallow: true });
  const list = paginateLocally(data, query, toSearchText);
  const [deleting, setDeleting] = useState<ContractPlan | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const handleDelete = (plan: ContractPlan) => {
    startDelete(async () => {
      const result = await deleteContractPlan(plan.plan_id);
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
        columns={createColumns(t, { onDelete: setDeleting })}
        data={list.rows}
        getRowId={(row) => row.plan_id}
        emptyMessage={t('noData')}
        pending={isDeleting}
      />

      <DeleteConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('deleteDialogTitle')}
        description={(plan) => t.rich('deleteDialogBody', { name: plan.plan_name, bold: boldChunks })}
        confirmLabel={t('deleteConfirm')}
      />
    </div>
  );
}
