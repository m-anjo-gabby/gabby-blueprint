/**
 * 保存のサーバーアクションが通信の失敗等で例外になった時の文言（戻り値の失敗と同じく、表示を元に戻してから出す）。
 * 表示を先に切り替えてから保存する部品は `.catch()` でこの文言の失敗に変える（testing/TEST-JUDGEMENT-GUIDE.md KJ-2026-1013-02）。
 */
export const SAVE_NETWORK_ERROR_MESSAGE = 'Could not save your setting. Please check your connection and try again.';
