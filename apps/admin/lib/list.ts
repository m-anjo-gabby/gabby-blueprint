/**
 * 管理画面の一覧（検索・絞り込み・ページ送り）の共通定義。
 * 条件の正本は URL のクエリ（`q` = 検索語、`page` = ページ番号、ほかは画面ごとの絞り込み）で、
 * サーバー（page.tsx）とブラウザ（useListQuery）の両方がこのファイルの関数で読み取る。
 */

/** 1ページの件数 */
export const LIST_PAGE_SIZE = 10;

/** 1回で取得できる最大件数（サーバーアクションへ不正な件数が渡された場合の上限） */
const MAX_PAGE_SIZE = 100;

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface ListParams<K extends string = never> {
  page: number;
  pageSize: number;
  /** 検索語（前後の空白を除く。未指定は空文字） */
  q: string;
  /** 画面ごとの絞り込み（未指定は空文字） */
  filters: Record<K, string>;
}

/** 一覧の取得結果 */
export interface ListResult<T> {
  rows: T[];
  totalCount: number;
}

function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** URL のクエリから一覧の条件を読み取る */
export function parseListParams<K extends string = never>(
  raw: RawSearchParams,
  filterKeys: readonly K[] = []
): ListParams<K> {
  const page = Math.floor(Number(firstValue(raw.page)));
  return {
    page: page >= 1 ? page : 1,
    pageSize: LIST_PAGE_SIZE,
    q: firstValue(raw.q).trim(),
    filters: Object.fromEntries(filterKeys.map((key) => [key, firstValue(raw[key])])) as Record<K, string>,
  };
}

/** 全ページ数（0件でも1ページとして扱う） */
export function toPageCount(totalCount: number, pageSize: number = LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

/** Supabase の `.range(from, to)` に渡す範囲（ページ番号・件数は不正な値を丸める） */
export function toRange({ page, pageSize }: Pick<ListParams, 'page' | 'pageSize'>): [number, number] {
  const size = Math.min(Math.max(Math.floor(pageSize) || LIST_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const from = (Math.max(Math.floor(page) || 1, 1) - 1) * size;
  return [from, from + size - 1];
}

/**
 * 全件を取得済みの一覧（件数の少ないマスタ等）を、ブラウザ側で検索・ページ分けする。
 * 表示中のページが全ページ数を超える場合（検索で件数が減った等）は最終ページを表示する。
 */
export function paginateLocally<T>(
  rows: readonly T[],
  { q, page }: Pick<ListParams, 'q' | 'page'>,
  toSearchText: (row: T) => string
): ListResult<T> & { page: number; pageCount: number } {
  const term = q.toLowerCase();
  const matched = term ? rows.filter((row) => toSearchText(row).toLowerCase().includes(term)) : rows;
  const pageCount = toPageCount(matched.length);
  const current = Math.min(page, pageCount);
  return {
    rows: matched.slice((current - 1) * LIST_PAGE_SIZE, current * LIST_PAGE_SIZE),
    totalCount: matched.length,
    page: current,
    pageCount,
  };
}
