// Postgres のエラーコード（PostgREST・RPC のエラーの code）。削除の規約は docs/DATA-DELETION.md

/** 外部キーの参照が残っている（ON DELETE RESTRICT に当たった＝利用実績があり物理削除できない） */
export const FOREIGN_KEY_VIOLATION = '23503';

/** 一意制約の違反 */
export const UNIQUE_VIOLATION = '23505';

/** 物理削除が利用実績（RESTRICT の外部キー）で止められたか */
export function isInUseError(error: { code?: string } | null | undefined): boolean {
  return error?.code === FOREIGN_KEY_VIOLATION;
}
