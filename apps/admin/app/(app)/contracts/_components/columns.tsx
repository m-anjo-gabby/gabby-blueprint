// src/app/(app)/admin/contracts/_components/columns.tsx
'use client';

import { Eye, Pencil } from 'lucide-react';
import type { useTranslations } from 'next-intl';
import { formatZonedDate, toIsoDateInZone } from '@gabby/lib/date/date';
import { type ContractDetail } from '@gabby/types/contract';
import type { ListColumnDef } from '@/components/list/listTable';
import { Badge } from '@/components/ui/badge';
import { ContractFormDialog } from './ContractFormDialog';
import { ContractLicenseDialog } from './ContractLicenseDialog';
import { DeleteContractDialog } from './DeleteContractDialog';

type TableT = ReturnType<typeof useTranslations<'contracts.table'>>;

// 契約期間は JST の 0:00〜23:59:59 で保存しているため、JST の暦の日付で表示・判定する。
// タイムゾーンを固定しないと、サーバー（UTC）とブラウザで日付がずれてハイドレーションが一致しない
const CONTRACT_TIMEZONE = 'Asia/Tokyo';
const toContractDate = (value: string) => toIsoDateInZone(value, CONTRACT_TIMEZONE);

export function createColumns(t: TableT): ListColumnDef<ContractDetail>[] {
  return [
    {
      id: 'client_name',
      accessorKey: 'client_name',
      header: t('clientHeader'),
      cell: ({ row }) => {
        return <span className="font-medium text-slate-900">{row.original.client_name || t('clientUnlinked')}</span>;
      },
    },
    {
      // 契約名（アドミン管理用）を主表示にし、生徒・コーチに表示されるプラン名を補足で出す
      accessorKey: 'contract_name',
      header: t('planHeader'),
      cell: ({ row }) => {
        const contract = row.original;
        return (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-900">{contract.contract_name}</span>
            <span className="text-[11px] text-slate-500">{contract.plan_name}</span>
            {contract.contract_type === 2 && (
              <div className="flex flex-wrap gap-1">
                <Badge className="w-fit bg-brand-100 text-brand-strong border-brand-200 hover:bg-brand-100 text-[10px] font-bold">
                  {t('liveBadge', { weekly: contract.weekly_frequency ?? 0, total: contract.total_sessions ?? 0 })}
                </Badge>
                {contract.has_dialogue_practice && (
                  <Badge className="w-fit bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100 text-[10px] font-bold">
                    {t('dialoguePracticeBadge')}
                  </Badge>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'license_usage',
      header: t('licenseUsageHeader'),
      cell: ({ row }) => {
        const contract = row.original;
        // 契約終了フラグ（終了日を過ぎている場合は操作不可）
        const isExpired = toContractDate(contract.end_date) < toContractDate(new Date().toISOString());

        const max = contract.max_licenses;
        // 無効化されたライセンスも「消化済み」として扱い続ける（枠は戻らない）ため、
        // 現在有効かどうか(current_active_count)ではなく、割当実績の総数
        // (current_assigned_count)を主要な使用状況の数値として表示する。
        const assigned = contract.current_assigned_count || 0;
        const usageRate = Math.min(Math.ceil((assigned / max) * 100), 100);

        // 表示用の共通UIコンポーネント
        const UsageDisplay = (
          <div
            className={`flex items-center gap-4 py-2 w-fit cursor-pointer group/usage ${isExpired ? 'opacity-50' : ''}`}
          >
            {/* 左側：数値 ＋ プログレスバー */}
            <div className="flex flex-col gap-1.5 min-w-[120px]">
              <div className="flex items-baseline gap-1">
                <span
                  className={`text-sm font-bold font-mono ${assigned >= max ? 'text-amber-600' : 'text-slate-900'} ${!isExpired && 'group-hover/usage:text-brand'} transition-colors`}
                >
                  {assigned}
                </span>
                <span className="text-slate-400 text-[10px]">/ {max}</span>
                <span className="text-[10px] text-slate-400 ml-1 whitespace-nowrap opacity-80">( {usageRate}% )</span>
              </div>

              <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200 shadow-sm transition-all">
                <div
                  className={`h-full transition-all duration-500 ${assigned >= max ? 'bg-amber-500' : 'bg-brand-500'}`}
                  style={{ width: `${usageRate}%` }}
                />
              </div>

              {assigned > max && (
                <div className="text-[9px] text-rose-500 font-black animate-pulse leading-none">
                  {t('overLimitLabel')}
                </div>
              )}
            </div>

            {/* 右側：ペンシルまたは参照ボタン（有効無効で切替表示） */}
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-xl border transition-all duration-300
            ${
              isExpired
                ? 'bg-slate-50 text-slate-400 border-slate-200 group-hover/usage:bg-brand-50 group-hover/usage:text-brand group-hover/usage:border-brand-200'
                : 'bg-brand-50 text-brand-500 border-brand-100 shadow-sm group-hover/usage:bg-brand group-hover/usage:text-white group-hover/usage:border-brand group-hover/usage:shadow-md'
            }`}
            >
              {isExpired ? <Eye size={14} strokeWidth={2.5} /> : <Pencil size={14} strokeWidth={2.5} />}
            </div>
          </div>
        );

        // 契約終了時も含めてダイアログ表示
        return <ContractLicenseDialog contract={contract}>{UsageDisplay}</ContractLicenseDialog>;
      },
    },
    {
      id: 'period',
      header: t('periodHeader'),
      cell: ({ row }) => {
        const start = formatZonedDate(row.original.start_date, CONTRACT_TIMEZONE);
        const end = formatZonedDate(row.original.end_date, CONTRACT_TIMEZONE);
        return (
          <div className="text-[11px] leading-tight space-y-0.5">
            <div className="text-slate-400">{t('startLabel', { date: start })}</div>
            <div className="text-slate-700 font-bold">{t('endLabel', { date: end })}</div>
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: t('statusHeader'),
      cell: ({ row }) => {
        const status = row.getValue('status') as number;
        // YYYY-MM-DD の文字列のため、文字列の大小で日付の前後を比べられる
        const start = toContractDate(row.original.start_date);
        const end = toContractDate(row.original.end_date);
        const today = toContractDate(new Date().toISOString());

        /**
         * 判定ロジックの優先順位:
         * 1. DBステータスが「無効(0)」または「解約(9)」なら期間に関わらずそれを表示
         * 2. 「有効(1)」であっても現在日付が範囲外なら「開始待ち」または「期間終了」を表示
         */
        if (status === 0) return <Badge variant="destructive">{t('statusInactive')}</Badge>;
        if (status === 9)
          return (
            <Badge variant="outline" className="text-slate-400">
              {t('statusCancelled')}
            </Badge>
          );

        if (end < today) {
          return (
            <Badge variant="secondary" className="bg-slate-200 text-slate-500">
              {t('statusEnded')}
            </Badge>
          );
        }

        if (start > today) {
          return (
            <Badge variant="outline" className="text-blue-500 border-blue-200 bg-blue-50">
              {t('statusUpcoming')}
            </Badge>
          );
        }

        return (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
            {t('statusActive')}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right"></div>,
      cell: ({ row }) => (
        <div className="flex justify-end items-center gap-2">
          {/* 契約内容の編集ダイアログ */}
          <ContractFormDialog mode="edit" initialData={row.original} />
          {/* 契約の削除（ライセンス割当実績がある契約は不可） */}
          <DeleteContractDialog contract={row.original} />
        </div>
      ),
    },
  ];
}
