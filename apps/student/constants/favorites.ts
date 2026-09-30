/**
 * お気に入りの登録上限（1人・種別ごと）。
 * DBのトリガー（supabase/DDL/function/fn_check_favorite_limit.sql の v_limit）と同じ値にすること。
 * Supabase API の1回の取得上限（max_rows=1000）と揃え、一覧を1回の取得で取りこぼしなく読めるようにしている。
 */
export const FAVORITE_LIMIT = 1000;

/** 上限超過時にDBが返すエラーコード（fn_check_favorite_limit の SQLSTATE） */
export const FAVORITE_LIMIT_ERROR_CODE = 'GBF01';

export const FAVORITE_LIMIT_MESSAGE = `お気に入りは${FAVORITE_LIMIT.toLocaleString()}件まで登録できます。不要なものを削除してから登録してください`;

export const FAVORITE_UPDATE_ERROR_MESSAGE = '更新できませんでした。通信環境を確認してください';

/**
 * お気に入り登録・解除の結果。
 * Server Action で投げた例外のメッセージは本番環境ではクライアントに渡らないため、上限超過は戻り値で返す。
 */
export type FavoriteToggleResult = { ok: true } | { ok: false; reason: 'limit' | 'error' };

/** 通信失敗等で Server Action 自体が例外になった場合の結果（呼び出し側で .catch に渡す） */
export const FAVORITE_TOGGLE_NETWORK_ERROR: FavoriteToggleResult = { ok: false, reason: 'error' };

export function getFavoriteToggleErrorMessage(result: Extract<FavoriteToggleResult, { ok: false }>): string {
  return result.reason === 'limit' ? FAVORITE_LIMIT_MESSAGE : FAVORITE_UPDATE_ERROR_MESSAGE;
}
