// apps/admin/app/(app)/clients/_components/columns.tsx
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { ClientFormDialog } from './ClientFormDialog';
import { Badge } from '@/components/ui/badge';
import { ClientRecord } from '@gabby/types/client';

export const columns: ColumnDef<ClientRecord>[] = [
  {
    accessorKey: "client_name",
    header: "顧客名称",
    cell: ({ row }) => <span className="font-bold text-slate-700">{row.getValue("client_name")}</span>,
  },
  {
    accessorKey: "client_type",
    header: "種別",
    cell: ({ row }) => {
      const type = row.getValue("client_type");
      return (
        <Badge variant="secondary" className="font-medium">
          {type === 1 ? "法人" : "個人"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "industry_type",
    header: "業界",
    cell: ({ row }) => {
      const industry = row.getValue("industry_type");
      const labels: Record<number, string> = { 1: "製薬", 2: "半導体", 3: "その他" };
      return <span className="text-sm text-slate-600">{labels[Number(industry)] || "未設定"}</span>;
    },
  },
  {
    accessorKey: "insert_date",
    header: "登録日",
    cell: ({ row }) => {
      const date = new Date(row.getValue("insert_date"));
      return <span className="text-xs text-slate-500">{date.toLocaleDateString('ja-JP')}</span>;
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right"></div>,
    cell: ({ row }) => (
      <div className="text-right">
        {/* 編集モードでダイアログを呼び出し、行データを渡す */}
        <ClientFormDialog mode="edit" initialData={row.original} />
      </div>
    ),
  },
];