/**
 * 教材一覧（/contents）の検索・絞り込み・ページ条件（クエリ文字列）を、
 * エディタ画面から一覧へ戻る際に復元するための保存領域。
 * タブ単位で保持できれば十分なため sessionStorage を使用する。
 */
const STORAGE_KEY = 'admin:contents:listQuery';
export const CONTENTS_LIST_PATH = '/contents';

export function saveContentsListQuery(query: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, query);
  } catch {
    // ストレージ無効環境では保持しない（一覧は初期条件で表示される）
  }
}

export function getContentsListHref(): string {
  try {
    const query = sessionStorage.getItem(STORAGE_KEY);
    return query ? `${CONTENTS_LIST_PATH}?${query}` : CONTENTS_LIST_PATH;
  } catch {
    return CONTENTS_LIST_PATH;
  }
}
