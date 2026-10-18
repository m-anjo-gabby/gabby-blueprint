'use client';

import type { ListColumnDef } from '@/components/list/listTable';
import type { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InactiveBadge } from '@/components/common/InactiveBadge';
import type { ContractPlan } from '@gabby/types/contract';
import { ContractPlanFormDialog } from './ContractPlanFormDialog';

type TableT = ReturnType<typeof useTranslations<'contracts.plans.table'>>;

export function createColumns(
  t: TableT,
  { onDelete }: { onDelete: (plan: ContractPlan) => void },
): ListColumnDef<ContractPlan>[] {
  return [
    {
      accessorKey: 'sort_no',
      header: t('seqHeader'),
      cell: ({ row }) => <span className="font-mono text-slate-500">{row.original.sort_no}</span>,
    },
    {
      accessorKey: 'plan_name',
      header: t('planNameHeader'),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="flex items-center gap-2 font-bold text-slate-700">
            {row.original.plan_name}
            {!row.original.is_active && <InactiveBadge label={t('inactiveBadge')} />}
          </span>
          <span className="text-[11px] text-slate-400">{row.original.plan_name_en}</span>
        </div>
      ),
    },
    {
      accessorKey: 'contract_type',
      header: t('structureHeader'),
      cell: ({ row }) => {
        const plan = row.original;
        return (
          <div className="flex flex-wrap gap-1.5">
            {plan.contract_type === 1 ? (
              <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-bold">
                {t('noCoachBadge')}
              </Badge>
            ) : (
              <>
                <Badge className="bg-brand-100 text-brand-strong border-brand-200 hover:bg-brand-100 text-[10px] font-bold">
                  {t('liveBadge', { weekly: plan.weekly_frequency ?? 0, total: plan.total_sessions ?? 0 })}
                </Badge>
                {plan.has_dialogue_practice && (
                  <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100 text-[10px] font-bold">
                    {t('dialoguePracticeBadge')}
                  </Badge>
                )}
              </>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'period_months',
      header: t('periodHeader'),
      cell: ({ row }) => (
        <span className="text-slate-600">{t('periodUnit', { count: row.original.period_months })}</span>
      ),
    },
    {
      accessorKey: 'plan_code',
      header: t('codeHeader'),
      cell: ({ row }) => <span className="text-[10px] text-slate-400 font-mono">{row.original.plan_code}</span>,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('actionsHeader')}</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <ContractPlanFormDialog mode="edit" initialData={row.original} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(row.original)}
            aria-label={t('deleteDialogTitle')}
            className="h-8 w-8 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];
}
