/**
 * Server Component で描画ごとの一意なIDを作る（クライアントの useRefreshOnRestoredRender に渡し、
 * キャッシュ済みの画面が再利用されたことの検知に使う）。
 * 'use client' のモジュールに置くとサーバーから呼べないため、別モジュールにしている。
 */
export function createRenderId(): string {
  return crypto.randomUUID();
}
