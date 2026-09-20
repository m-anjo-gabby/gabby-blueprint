// apps/admin/app/(app)/clients/_components/columns.tsx
'use client';

import { ColumnDef } from '@tanstack/react-table';
import type { useTranslations } from 'next-intl';
import { ClientFormDialog } from './ClientFormDialog';
import { Badge } from '@/components/ui/badge';
import { ClientRecord } from '@gabby/types/client';

type TableT = ReturnType<typeof useTranslations<'clients.table'>>;

export function createColumns(t: TableT, locale: string): ColumnDef<ClientRecord>[] {
  return [
  {
    accessorKey: "client_name",
    header: t('nameHeader'),
    cell: ({ row }) => <span className="font-bold text-slate-700">{row.getValue("client_name")}</span>,
  },
  {
    accessorKey: "client_type",
    header: t('typeHeader'),
    cell: ({ row }) => {
      const type = row.getValue("client_type");
      return (
        <Badge variant="secondary" className="font-medium">
          {type === 1 ? t('typeCorporate') : t('typeIndividual')}
        </Badge>
      );
    },
  },
  {
    accessorKey: "industry_type",
    header: t('industryHeader'),
    cell: ({ row }) => {
      const industry = row.getValue("industry_type");
      const labels: Record<number, string> = { 1: t('industryPharma'), 2: t('industrySemiconductor'), 3: t('industryOther') };
      return <span className="text-sm text-slate-600">{labels[Number(industry)] || t('industryNotSet')}</span>;
    },
  },
  {
    accessorKey: "insert_date",
    header: t('registeredDateHeader'),
    cell: ({ row }) => {
      const date = new Date(row.getValue("insert_date"));
      return <span className="text-xs text-slate-500">{date.toLocaleDateString(locale === 'en' ? 'en-US' : 'ja-JP')}</span>;
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
}
