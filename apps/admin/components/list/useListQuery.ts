'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { parseListParams } from '@/lib/list';

export interface ListQuery<K extends string = never> {
  q: string;
  page: number;
  filters: Record<K, string>;
  /** 検索語・絞り込みのどれかが指定されているか（「条件をクリア」を押せるか） */
  hasConditions: boolean;
  /** 条件の変更でサーバーから一覧を取り直している最中か（shallow では常に false） */
  isPending: boolean;
  setSearch: (term: string) => void;
  setFilter: (key: K, value: string) => void;
  setPage: (page: number) => void;
  /** 検索語・絞り込み・ページをすべて初期状態に戻す */
  clear: () => void;
}

interface ListQueryOptions {
  /**
   * true: URL だけを書き換え、サーバーへは取りに行かない（全件を取得済みでブラウザ側で絞る一覧用。lib/list の paginateLocally と組み合わせる）
   * false: URL を書き換えてサーバーで一覧を取り直す
   */
  shallow?: boolean;
}

/**
 * 一覧の条件（URL のクエリ `q` / `page` / 画面ごとの絞り込み）の読み書き。
 * 条件を変えたら1ページ目に戻す（`page` をクエリから外す）。
 * URL のクエリだけが変わる遷移では loading.tsx が出ないため、取り直し中は isPending を表に渡して示す。
 */
export function useListQuery<K extends string = never>(
  filterKeys: readonly K[] = [],
  { shallow = false }: ListQueryOptions = {}
): ListQuery<K> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const { q, page, filters } = parseListParams(Object.fromEntries(searchParams), filterKeys);

  const navigate = (update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    if (shallow) {
      // Next.js の useSearchParams は history.pushState と連動する（サーバーへの再取得は起きない）
      window.history.pushState(null, '', href);
    } else {
      startTransition(() => router.push(href));
    }
  };

  const setOrDelete = (params: URLSearchParams, key: string, value: string) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };

  return {
    q,
    page,
    filters,
    hasConditions: q !== '' || filterKeys.some((key) => filters[key] !== ''),
    isPending,
    setSearch: (term) =>
      navigate((params) => {
        setOrDelete(params, 'q', term.trim());
        params.delete('page');
      }),
    setFilter: (key, value) =>
      navigate((params) => {
        setOrDelete(params, key, value);
        params.delete('page');
      }),
    setPage: (next) =>
      navigate((params) => {
        setOrDelete(params, 'page', next > 1 ? String(next) : '');
      }),
    clear: () =>
      navigate((params) => {
        for (const key of ['q', 'page', ...filterKeys]) params.delete(key);
      }),
  };
}
