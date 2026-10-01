/**
 * お気に入り画面の表示状態（種別・絞り込み）を URL のクエリに書き込む。
 * history.replaceState を使い、サーバーへの再取得や履歴の積み上げをしない
 * （Next.js の useSearchParams はこの変更にも追従する）。
 */
export function replaceSearchParams(current: { toString(): string }, update: (params: URLSearchParams) => void): void {
  const params = new URLSearchParams(current.toString());
  update(params);
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}
