'use client';

import type { ListColumnDef } from '@/components/list/listTable';
import type { useTranslations } from 'next-intl';
import { Library, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { KnowledgeEntry } from '@/actions/aiKnowledgeBaseAction';
import type { KnowledgeSourceTypeOption } from '../_lib/knowledgeSourceTypes';
import { KnowledgeEntryFormDialog } from './KnowledgeEntryFormDialog';

type ListT = ReturnType<typeof useTranslations<'tools.aiKnowledgeBase.list'>>;

interface ColumnOptions {
  sourceTypeOptions: readonly KnowledgeSourceTypeOption[];
  onDelete: (entry: KnowledgeEntry) => void;
}

export function createColumns(t: ListT, { sourceTypeOptions, onDelete }: ColumnOptions): ListColumnDef<KnowledgeEntry>[] {
  return [
    {
      accessorKey: 'source_type',
      header: t('typeHeader'),
      cell: ({ row }) => {
        const option = sourceTypeOptions.find((o) => o.value === row.original.source_type);
        const Icon = option?.icon ?? Library;
        return (
          <Badge
            variant="outline"
            className={cn('gap-1 border-none px-2 text-[10px] font-bold', option?.badgeClassName ?? 'bg-slate-100 text-slate-500')}
          >
            <Icon size={12} />
            {option?.label ?? row.original.source_type}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'title',
      header: t('titleHeader'),
      cell: ({ row }) => (
        <div className="max-w-xl space-y-1">
          <p className="truncate text-sm font-bold text-slate-800">{row.original.title}</p>
          <p className="line-clamp-2 whitespace-normal text-xs leading-relaxed text-slate-400">{row.original.body}</p>
        </div>
      ),
    },
    {
      accessorKey: 'embedding_model',
      header: t('embeddingHeader'),
      cell: ({ row }) =>
        row.original.embedding_model ? (
          <span className="font-mono text-[11px] text-slate-500">{row.original.embedding_model}</span>
        ) : (
          <Badge variant="outline" className="border-none bg-amber-50 px-1.5 text-[10px] font-bold text-amber-600">
            {t('notEmbeddedBadge')}
          </Badge>
        ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('actionsHeader')}</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <KnowledgeEntryFormDialog mode="edit" initialData={row.original} />
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
