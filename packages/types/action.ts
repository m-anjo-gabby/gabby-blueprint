/**
 * サーバーアクションの結果の型。書き方は docs/CODING.md「エラーの返し方」。
 *
 * - 画面から呼ぶアクション（各アプリの actions/）は ActionResult を返す。失敗の message はそのアプリの言語で、
 *   画面にそのまま出せる文言にする（DB・外部サービスのエラー本文は入れず、ログに残す）。
 * - 共通部分の実装（packages/lib の *Core）は CoreResult を返す。文言は持たず、各アプリが errorCode を自分の言語の文言にする。
 */

/** 失敗（画面向け）。画面で分岐が必要な場合だけ errorCode も返す */
export interface ActionFailure<C extends string = never> {
  success: false;
  message: string;
  errorCode?: C;
}

/** 画面から呼ぶアクションの結果。成功時に返す値は名前付きの項目で並べる（例: ActionResult<{ slot: Slot }>） */
export type ActionResult<T extends object = object, C extends string = never> =
  ({ success: true } & T) | ActionFailure<C>;

/** 共通部分の実装（*Core）の結果。失敗は errorCode だけを返す */
export type CoreResult<T extends object = object, C extends string = string> =
  ({ success: true } & T) | { success: false; errorCode: C };

/** 種別を細かく分けない共通部分の失敗（未ログイン・想定外） */
export type BasicErrorCode = 'unauthorized' | 'unexpected_error';
