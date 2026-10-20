/**
 * 区切り・ビデオの並べ替え。並び順（seq_no）は 1 からの連番に振り直し、変わった行だけを書き戻す
 * （旧データの重複・欠番もこの時に詰まる）。
 */

export interface OrderedItem {
  id: string;
  seq_no: number;
}

/** 1つ上（-1）・1つ下（+1）へ動かした後の並び（端で動かせない場合・見つからない場合は null） */
export function moveInOrder(ids: readonly string[], id: string, direction: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** 並びのとおりに 1 からの連番を振り、今の seq_no と違う行だけを返す */
export function renumberChanges(
  orderedIds: readonly string[],
  current: readonly OrderedItem[],
): { id: string; seq_no: number }[] {
  const currentSeq = new Map(current.map((item) => [item.id, item.seq_no]));
  return orderedIds
    .map((id, index) => ({ id, seq_no: index + 1 }))
    .filter(({ id, seq_no }) => currentSeq.get(id) !== seq_no);
}

/** 末尾に足す時の seq_no */
export function nextSeqNo(items: readonly { seq_no: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.seq_no), 0) + 1;
}
