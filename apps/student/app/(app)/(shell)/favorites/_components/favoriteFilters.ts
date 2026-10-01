/**
 * お気に入り一覧の絞り込み（連動する複数のセレクト）の定義と計算。
 * 選択肢は登録済みの項目から作り、前の絞り込みで対象を狭めてから次の選択肢を作る
 * （例: スプリント問題の 教材 → 問題種別 → レベル）。選択肢が1つ以下の絞り込みは出さない。
 */

/** 絞り込みの「すべて」 */
export const ALL_OPTION = 'all';

export interface FavoriteFilterOption {
  id: string;
  label: string;
  /** 並び順（小さい順。同じ値の場合は表示名順） */
  order: number;
}

export interface FavoriteFilterDef<T> {
  /** URLのクエリパラメータ名を兼ねる（例: 'content' / 'type' / 'level'） */
  id: string;
  /** 見出し・チップの表示名（例: 「教材」） */
  label: string;
  /** 「すべて」の表示名（例: 「すべての教材」） */
  allLabel: string;
  /** 項目の分類。この絞り込みの対象外の項目（例: レベルの無い教材の問題）は null */
  getOption: (item: T) => FavoriteFilterOption | null;
  /** 指定した絞り込みで「すべて」以外が選ばれている場合だけ出す（例: レベルは問題種別を選んでから） */
  requires?: string;
}

export interface ResolvedFilterOption extends FavoriteFilterOption {
  count: number;
}

export interface ResolvedFilter {
  id: string;
  label: string;
  allLabel: string;
  options: ResolvedFilterOption[];
  /** 選択中の値（ALL_OPTION または options の id） */
  value: string;
}

/**
 * 選択状態から、表示する絞り込み（選択肢・件数）と絞り込み後の項目を求める。
 * 選択中の値が選択肢に無い場合（URLの手入力・削除で無くなった等）は「すべて」として扱う。
 */
export function resolveFavoriteFilters<T>(
  items: readonly T[],
  defs: readonly FavoriteFilterDef<T>[],
  selected: Readonly<Record<string, string | null | undefined>>
): { filters: ResolvedFilter[]; items: T[] } {
  let pool = [...items];
  const filters: ResolvedFilter[] = [];

  for (const def of defs) {
    if (def.requires && !filters.some((f) => f.id === def.requires && f.value !== ALL_OPTION)) continue;

    const optionById = new Map<string, ResolvedFilterOption>();
    for (const item of pool) {
      const option = def.getOption(item);
      if (!option) continue;
      const current = optionById.get(option.id);
      if (current) current.count += 1;
      else optionById.set(option.id, { ...option, count: 1 });
    }
    if (optionById.size < 2) continue;

    const options = Array.from(optionById.values()).sort(
      (a, b) => a.order - b.order || a.label.localeCompare(b.label, 'ja')
    );
    const requested = selected[def.id];
    const value = requested && optionById.has(requested) ? requested : ALL_OPTION;
    filters.push({ id: def.id, label: def.label, allLabel: def.allLabel, options, value });

    if (value !== ALL_OPTION) pool = pool.filter((item) => def.getOption(item)?.id === value);
  }

  return { filters, items: pool };
}

/** 指定した絞り込みより後ろ（連動して選択肢が変わるもの）の絞り込みID */
export function getDownstreamFilterIds<T>(defs: readonly FavoriteFilterDef<T>[], filterId: string): string[] {
  const index = defs.findIndex((d) => d.id === filterId);
  return index < 0 ? [] : defs.slice(index + 1).map((d) => d.id);
}
