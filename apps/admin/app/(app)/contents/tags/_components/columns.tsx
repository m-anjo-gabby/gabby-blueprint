'use client';

import type { ListColumnDef } from '@/components/list/listTable';
import type { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TAG_TYPES, type ContentTag, type TagType } from '@gabby/types/content';
import { TagFormDialog } from './TagFormDialog';

type TableT = ReturnType<typeof useTranslations<'contents.tags.table'>>;

/** タグ種別の分類色 */
const TYPE_COLORS: Record<TagType, string> = {
  industry: 'bg-blue-100 text-blue-700 border-blue-200',
  scene: 'bg-purple-100 text-purple-700 border-purple-200',
  skill: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  level: 'bg-orange-100 text-orange-700 border-orange-200',
  other: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function createColumns(
  t: TableT,
  { onDelete }: { onDelete: (tag: ContentTag) => void },
): ListColumnDef<ContentTag>[] {
  return [
    {
      accessorKey: 'seq_no',
      header: 'SEQ',
      cell: ({ row }) => <span className="font-mono text-slate-500">{row.original.seq_no}</span>,
    },
    {
      accessorKey: 'tag_type',
      header: t('typeHeader'),
      cell: ({ row }) => (
        <Badge variant="outline" className={`${TYPE_COLORS[row.original.tag_type]} font-bold`}>
          {TAG_TYPES[row.original.tag_type].label}
        </Badge>
      ),
    },
    {
      accessorKey: 'tag_name',
      header: t('nameHeader'),
      cell: ({ row }) => <span className="font-bold text-slate-700">{row.original.tag_name}</span>,
    },
    {
      accessorKey: 'tag_id',
      header: t('idHeader'),
      cell: ({ row }) => <span className="font-mono text-[10px] text-slate-400">{row.original.tag_id}</span>,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('actionsHeader')}</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <TagFormDialog mode="edit" initialData={row.original} />
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
