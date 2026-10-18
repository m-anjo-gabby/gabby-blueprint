'use client';

import Link from 'next/link';
import type { ListColumnDef } from '@/components/list/listTable';
import type { useTranslations } from 'next-intl';
import { Edit, FileText, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TermListItem } from '@gabby/types/term';

type TableT = ReturnType<typeof useTranslations<'terms.table'>>;

interface ColumnOptions {
  /** 規約種別の表示名 */
  termTypeLabel: (term: TermListItem) => string;
  onDelete: (term: TermListItem) => void;
}

export function createColumns(t: TableT, { termTypeLabel, onDelete }: ColumnOptions): ListColumnDef<TermListItem>[] {
  return [
    {
      accessorKey: 'term_type',
      header: t('termTypeHeader'),
      cell: ({ row }) => {
        const isTerms = row.original.term_type === 'TERMS';
        return (
          <div className="flex items-center gap-2">
            <div className={`rounded-lg p-1.5 ${isTerms ? 'bg-brand-50 text-brand' : 'bg-amber-50 text-amber-600'}`}>
              {isTerms ? <ShieldCheck size={14} /> : <FileText size={14} />}
            </div>
            <span className="text-sm font-bold text-slate-900">{termTypeLabel(row.original)}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'version_name',
      header: t('versionHeader'),
      cell: ({ row }) => (
        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600">
          {row.original.version_name}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('statusHeader'),
      cell: ({ row }) => {
        const term = row.original;
        // 公開日時が未来
        if (term.is_upcoming) {
          return (
            <Badge variant="outline" className="border-amber-100 bg-amber-50 px-2 text-[10px] font-bold text-amber-600">
              {t('statusUpcoming')}
            </Badge>
          );
        }
        // 公開日時が過去、かつ「その種別の中で現在有効な最新版」
        if (term.is_current) {
          return (
            <Badge className="border-emerald-100 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-600 shadow-sm">
              {t('statusPublished')}
            </Badge>
          );
        }
        // それ以外（過去の版）
        return (
          <Badge variant="outline" className="border-slate-100 bg-slate-50 px-2 text-[10px] font-medium text-slate-400">
            {t('statusEnded')}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'published_date',
      header: t('publishedDateHeader'),
      cell: ({ row }) => (
        <span className="font-mono text-[12px] font-medium text-slate-500">{row.original.published_date}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('actionsHeader')}</div>,
      cell: ({ row }) => {
        const term = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:bg-brand-50 hover:text-brand"
              asChild
              title={t('editTooltip')}
            >
              <Link href={`/terms/${term.term_id}/edit`}>
                <Edit />
              </Link>
            </Button>
            {/* 公開前のみ削除可能（公開後は同意履歴の証跡となるため削除しない） */}
            {term.is_upcoming && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                onClick={() => onDelete(term)}
                title={t('deleteTooltip')}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}
