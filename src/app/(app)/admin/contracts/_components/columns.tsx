// src/app/(app)/admin/contracts/_components/columns.tsx
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { format, isAfter, isBefore, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ContractDetail } from '@/types/contract';
import { ContractFormDialog } from './ContractFormDialog';
import { ContractLicenseDialog } from './ContractLicenseDialog';

export const columns: ColumnDef<ContractDetail>[] = [
  {
    id: 'client_name',
    accessorKey: 'com_m_client.client_name',
    header: '顧客名',
    cell: ({ row }) => {
      return (
        <span className="font-medium text-slate-900">
          {row.original.client_name || '未紐付け'}
        </span>
      );
    },
  },
  {
    accessorKey: 'plan_name',
    header: 'プラン',
    cell: ({ row }) => (
      <span className="font-medium text-slate-700">
        {row.getValue('plan_name')}
      </span>
    ),
  },
  {
    id: 'license_usage',
    header: 'ライセンス利用状況',
    cell: ({ row }) => {
      const max = row.original.max_licenses;
      const active = row.original.current_active_count || 0;
      const assigned = row.original.current_assigned_count || 0;
      
      // 利用率の計算
      const usageRate = Math.min(Math.ceil((active / max) * 100), 100);
      
      return (
        <div className="flex flex-col gap-1.5 min-w-25">
          <div className="flex items-baseline gap-1">
            <span className={`text-sm font-bold font-mono ${active >= max ? 'text-amber-600' : 'text-slate-900'}`}>
              {active}
            </span>
            <span className="text-slate-400 text-[10px]">/ {max}</span>
            <span className="text-[10px] text-slate-400 ml-1">( {usageRate}% )</span>
          </div>

          {/* プログレスバー */}
          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200 shadow-sm">
            <div 
              className={`h-full transition-all duration-500 ${
                active >= max ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${usageRate}%` }}
            />
          </div>

          {/* 補足：割当済み（期間外含む）が上限を超えている場合の警告表示なども検討可 */}
          {assigned > max && (
            <div className="text-[9px] text-rose-500 font-medium">
              ※ 超過しています
            </div>
          )}
        </div>
      );
    },
  },
  {
    id: 'period',
    header: '契約期間',
    cell: ({ row }) => {
      const start = new Date(row.original.start_date);
      const end = new Date(row.original.end_date);
      return (
        <div className="text-[11px] leading-tight space-y-0.5">
          <div className="text-slate-400">開始: {format(start, 'yyyy/MM/dd', { locale: ja })}</div>
          <div className="text-slate-700 font-bold">終了: {format(end, 'yyyy/MM/dd', { locale: ja })}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'ステータス',
    cell: ({ row }) => {
      const status = row.getValue('status') as number;
      const start = new Date(row.original.start_date);
      const end = new Date(row.original.end_date);
      const now = startOfDay(new Date()); // 時刻を除外して日付のみで比較

      /**
       * 判定ロジックの優先順位:
       * 1. DBステータスが「無効(0)」または「解約(9)」なら期間に関わらずそれを表示
       * 2. 「有効(1)」であっても現在日付が範囲外なら「開始待ち」または「期間終了」を表示
       */
      if (status === 0) return <Badge variant="destructive">停止中</Badge>;
      if (status === 9) return <Badge variant="outline" className="text-slate-400">解約済</Badge>;

      if (isBefore(end, now)) {
        return <Badge variant="secondary" className="bg-slate-200 text-slate-500">期間終了</Badge>;
      }
      
      if (isAfter(start, now)) {
        return <Badge variant="outline" className="text-blue-500 border-blue-200 bg-blue-50">開始待ち</Badge>;
      }

      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">稼働中</Badge>;
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right"></div>,
    cell: ({ row }) => (
      <div className="flex justify-end items-center gap-2">
        {/* 1. ライセンス割当状況ダイアログ */}
        <ContractLicenseDialog contract={row.original} />

        {/* 2. 契約内容の編集ダイアログ */}
        <ContractFormDialog mode="edit" initialData={row.original} />
      </div>
    ),
  },
];