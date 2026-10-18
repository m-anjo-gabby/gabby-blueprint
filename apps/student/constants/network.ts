/**
 * 保存のサーバーアクションが通信の失敗等で例外になった時の文言（戻り値の失敗と同じく、表示を元に戻してから出す）。
 * 表示を先に切り替えてから保存する部品は `.catch()` でこの文言の失敗に変える（testing/TEST-JUDGEMENT-GUIDE.md KJ-2026-1013-02）。
 */
export const SAVE_NETWORK_ERROR_MESSAGE = '保存できませんでした。通信環境を確認してから、もう一度お試しください';

/** 区画のデータを読み込めなかった時の文言（`SectionLoadError` に渡す。「0件」と見分けがつくように出す） */
export const LOAD_ERROR_MESSAGE = 'データを読み込めませんでした。時間を置いてから、もう一度お試しください';
export const RELOAD_LABEL = '再読み込み';
