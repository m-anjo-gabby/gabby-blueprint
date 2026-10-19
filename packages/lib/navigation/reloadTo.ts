/**
 * 画面を読み込み直して path へ移る（ブラウザ専用）。
 * メモリ上の状態（zustand のストア・React のキャッシュ）を確実に捨てる必要がある場合だけ使う
 * （ログアウト直後・描画中の例外からの退避）。通常の遷移は router.push / redirect を使う。
 */
export function reloadTo(path: string): void {
  window.location.assign(path);
}
