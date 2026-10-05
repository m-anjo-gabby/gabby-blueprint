'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Trash2, AlertCircle, Library, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { deleteKnowledgeEntryAction, type KnowledgeEntry } from '@/actions/aiKnowledgeBaseAction';
import { getKnowledgeSourceTypeOptions, getKnowledgeSourceTypeOption } from '../_lib/knowledgeSourceTypes';
import { KnowledgeEntryFormDialog } from './KnowledgeEntryFormDialog';

interface KnowledgeEntryListProps {
  entries: KnowledgeEntry[];
  pageCount: number;
  totalCount: number;
}

export function KnowledgeEntryList({ entries, pageCount, totalCount }: KnowledgeEntryListProps) {
  const t = useTranslations('tools.aiKnowledgeBase.list');
  const tSourceTypes = useTranslations('tools.aiKnowledgeBase.sourceTypes');
  const sourceTypeOptions = useMemo(() => getKnowledgeSourceTypeOptions(tSourceTypes), [tSourceTypes]);
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams.get('page')) || 1;
  const sourceTypeFilter = searchParams.get('type') || 'all';
  const [searchValue, setSearchValue] = useState(searchParams.get('q') || '');

  const handleSearchTrigger = (term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set('q', term);
    } else {
      params.delete('q');
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSourceTypeChange = (type: string) => {
    const params = new URLSearchParams(searchParams);
    if (type === 'all') {
      params.delete('type');
    } else {
      params.set('type', type);
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleDelete = async (knowledgeId: string) => {
    const result = await deleteKnowledgeEntryAction(knowledgeId);
    if (result.success) {
      showToast(t('toastDeleted'), 'success');
    } else {
      showToast(result.message || t('toastDeleteFailed'), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-sm group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-brand-500 transition-colors" size={14} />
            <Input
              placeholder={t('searchPlaceholder')}
              className="pl-9 pr-8 h-9 bg-white border-slate-200 text-sm rounded-xl focus-visible:ring-brand-500"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchTrigger(searchValue)}
            />
            {searchValue && (
              <button
                onClick={() => { setSearchValue(''); handleSearchTrigger(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <Select value={sourceTypeFilter} onValueChange={handleSourceTypeChange}>
            <SelectTrigger className="h-9 w-44 rounded-xl border-slate-200 text-sm">
              <SelectValue placeholder={t('filterPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allTypes')}</SelectItem>
              {sourceTypeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <KnowledgeEntryFormDialog mode="create" />
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-300 gap-3 bg-white rounded-2xl border border-slate-200">
          <Library size={32} />
          <p className="text-sm font-bold text-slate-400">
            {totalCount === 0 ? t('emptyRegistered') : t('emptyFiltered')}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {entries.map((entry) => {
            const typeOption = getKnowledgeSourceTypeOption(entry.source_type, tSourceTypes);
            const Icon = typeOption?.icon ?? Library;

            return (
              <div
                key={entry.knowledge_id}
                className="group bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4 hover:border-brand-200 transition-colors"
              >
                <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${typeOption?.badgeClassName ?? 'bg-slate-100 text-slate-500'}`}>
                  <Icon size={16} />
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-bold border-none ${typeOption?.badgeClassName ?? 'bg-slate-100 text-slate-500'}`}>
                      {typeOption?.label ?? entry.source_type}
                    </Badge>
                    {!entry.embedding_model && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold border-none bg-amber-50 text-amber-600">
                        {t('notEmbeddedBadge')}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-sm font-black text-slate-800 truncate">{entry.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{entry.body}</p>
                </div>

                <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <KnowledgeEntryFormDialog mode="edit" initialData={entry} />

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-rose-500 hover:bg-rose-50">
                        <Trash2 size={14} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-3xl border-none p-8 max-w-[380px]">
                      <AlertDialogHeader className="space-y-4">
                        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                          <AlertCircle size={32} />
                        </div>
                        <div className="text-center space-y-2">
                          <AlertDialogTitle className="text-xl font-black text-slate-800">{t('deleteDialogTitle')}</AlertDialogTitle>
                          <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
                            {t.rich('deleteDialogBody', {
                              title: entry.title,
                              bold: (chunks) => <span className="font-bold text-slate-900">{chunks}</span>,
                            })}
                          </AlertDialogDescription>
                        </div>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex gap-3 mt-6">
                        <AlertDialogCancel className="flex-1 h-12 rounded-2xl border-none bg-slate-100 font-bold text-slate-500">
                          {t('cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(entry.knowledge_id)}
                          className="flex-1 h-12 rounded-2xl bg-rose-500 text-white font-bold hover:bg-rose-600 shadow-lg"
                        >
                          {t('deleteConfirm')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalCount > 0 && (
        <div className="flex items-center justify-between px-1 pt-2">
          <div className="text-[13px] text-slate-500 font-medium">
            {t.rich('totalCount', {
              count: totalCount,
              styled: (chunks) => <span className="text-slate-900 font-bold">{chunks}</span>,
            })}
          </div>
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="h-8 w-8 p-0 rounded-lg"
            >
              <ChevronLeft size={16} />
            </Button>
            <div className="flex items-center px-3 text-[13px] font-bold border-x border-slate-100 min-w-[4rem] justify-center text-slate-600 font-mono">
              {currentPage} / {pageCount || 1}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= pageCount}
              className="h-8 w-8 p-0 rounded-lg"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
