import { metaHelper, tableFeatures, type ColumnDef, type RowData } from '@tanstack/react-table';

/** 列ごとの追加情報（columnDef.meta） */
export interface ListColumnMeta {
  /** 見出しと各行のセルに付けるクラス（狭い画面で列を隠す `hidden xl:table-cell` 等） */
  className?: string;
}

/**
 * 一覧の表（DataTable）で使う tanstack table の機能。
 * 並べ替え・絞り込み・ページ分けはサーバー（または useListQuery + paginateLocally）で行うため、表は行を並べるだけにする。
 */
export const listTableFeatures = tableFeatures({
  columnMeta: metaHelper<ListColumnMeta>(),
});

/** 一覧の列の定義（各画面の `_components/columns.tsx` の createColumns が返す型） */
export type ListColumnDef<TData extends RowData> = ColumnDef<typeof listTableFeatures, TData>;
