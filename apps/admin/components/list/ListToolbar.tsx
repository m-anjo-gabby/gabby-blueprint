'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ListQuery } from './useListQuery';

type ToolbarQuery = Pick<ListQuery<string>, 'q' | 'page' | 'hasConditions' | 'setSearch' | 'setPage' | 'clear'>;

interface ListToolbarProps {
  query: ToolbarQuery;
  searchPlaceholder: string;
  totalCount: number;
  pageCount: number;
  /** 表示中のページ（ブラウザ側でページ分けし、範囲外のページを丸めた場合に渡す。既定は query.page） */
  page?: number;
  /** 絞り込み（ListSelectFilter・ClientFilter 等） */
  children?: ReactNode;
}

/**
 * 一覧の上部の操作欄（検索・絞り込み・条件のクリア・件数・ページ送り）。
 * 直下に DataTable を置く前提で、上側だけ角丸にしている。
 */
export function ListToolbar({ query, searchPlaceholder, totalCount, pageCount, page = query.page, children }: ListToolbarProps) {
  const t = useTranslations('common.list');

  return (
    <div className="flex flex-col gap-3 rounded-t-lg border-x border-t border-slate-200 bg-slate-50/80 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch value={query.q} placeholder={searchPlaceholder} submitLabel={t('search')} onSearch={query.setSearch} />
        {children}
        <Button
          variant="ghost"
          size="sm"
          onClick={query.clear}
          disabled={!query.hasConditions}
          icon={<RotateCcw />}
          className="h-9 text-slate-500 hover:text-slate-800"
        >
          {t('clear')}
        </Button>
      </div>

      <div className="flex items-center gap-4 self-end lg:self-auto">
        <div className="whitespace-nowrap text-[13px] font-medium text-slate-500">
          {t.rich('totalCount', {
            count: totalCount,
            styled: (chunks) => <span className="text-slate-900">{chunks}</span>,
          })}
        </div>
        <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => query.setPage(page - 1)}
            disabled={page <= 1}
            aria-label={t('prevPage')}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft />
          </Button>
          <div className="flex min-w-16 items-center justify-center border-x border-slate-100 px-3 text-[13px] font-medium text-slate-600">
            {page}
            <span className="mx-1 text-slate-300">/</span>
            {pageCount}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => query.setPage(page + 1)}
            disabled={page >= pageCount}
            aria-label={t('nextPage')}
            className="h-8 w-8 p-0"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ListSearchProps {
  /** 確定済みの検索語（URL の `q`） */
  value: string;
  placeholder: string;
  submitLabel: string;
  onSearch: (term: string) => void;
}

/** 検索欄（Enter または「検索」で確定する） */
function ListSearch({ value, placeholder, submitLabel, onSearch }: ListSearchProps) {
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  // 「条件をクリア」・ブラウザの戻る等で URL の検索語が変わったら、入力欄も合わせる
  if (value !== committed) {
    setCommitted(value);
    setDraft(value);
  }

  return (
    <form
      role="search"
      className="flex w-full items-center gap-2 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(draft);
      }}
    >
      <div className="relative flex-1 sm:w-72 sm:flex-none">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 bg-white pl-9 shadow-sm"
        />
      </div>
      <Button type="submit" variant="outline" size="sm" className="h-9 shrink-0 bg-white px-4 text-slate-600">
        {submitLabel}
      </Button>
    </form>
  );
}
