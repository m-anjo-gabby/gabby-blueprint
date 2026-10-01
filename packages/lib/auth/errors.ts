/**
 * 認証系アクション（ログイン・パスワード再設定・変更）のエラー種別
 *
 * 共通処理（actions.ts）は画面に出す文言ではなくこのコードを返し、
 * 文言は各アプリが自分の表示言語で解決する（admin: next-intl / coach: 英語辞書 / student: 日本語）。
 */
export const AUTH_ERROR_CODES = [
  // ログイン
  'missing_credentials',
  'account_locked',
  'account_locked_now',
  'invalid_credentials',
  'license_not_found',
  'portal_forbidden',
  // ログアウト
  'signout_failed',
  // 再設定メール
  'missing_email',
  // パスワードの設定・変更
  'password_too_short',
  'password_needs_alnum',
  'password_same_as_old',
  'password_leaked',
  'password_weak',
  'session_invalid',
  'password_update_failed',
  'session_timeout',
  'current_password_incorrect',
  'reset_link_required',
  // 招待
  'invitation_invalid',
  'invitation_expired',
  'account_create_failed',
  // 想定外
  'unexpected',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/**
 * 日本語の既定文言（student と、文言を持たないアプリのフォールバック）
 * `portal_forbidden` はポータルごとに案内先が異なるため、各アプリで上書きする。
 */
export const AUTH_ERROR_MESSAGES_JA: Record<AuthErrorCode, string> = {
  missing_credentials: 'メールアドレスとパスワードを入力してください。',
  account_locked: 'アカウントが一時的にロックされています。しばらく時間をおいてお試しください。',
  account_locked_now: 'パスワードを連続して間違えたため、アカウントが30分間ロックされました。',
  invalid_credentials: '認証情報が正しくありません。',
  license_not_found: '有効なライセンスが見つかりません。管理者にお問い合わせください。',
  portal_forbidden: 'このアカウントではログインできません。',
  signout_failed: 'ログアウト中にエラーが発生しました。',
  missing_email: 'メールアドレスを入力してください。',
  password_too_short: 'パスワードは8文字以上で入力してください。',
  password_needs_alnum: 'パスワードには英字と数字を両方含めてください。',
  password_same_as_old: '新しいパスワードは現在と同じものは使用できません。',
  password_leaked: 'このパスワードは過去にデータ漏洩の被害に遭った可能性があるため使用できません。他のパスワードを指定してください。',
  password_weak: 'このパスワードは単純すぎるか推測されやすいため使用できません。より複雑なパスワードを設定してください。',
  session_invalid: '認証セッションが無効、または期限が切れています。一度ログアウトして再度ログインしてからお試しください。',
  password_update_failed: 'パスワードの更新に失敗しました。',
  session_timeout: 'セッションがタイムアウトしました。再度ログインしてください。',
  current_password_incorrect: '現在のパスワードが正しくありません。',
  reset_link_required: '再設定リンクを確認できませんでした。お手数ですが、再設定メールの送信からやり直してください。',
  invitation_invalid: 'この招待リンクは無効か、すでに本登録が完了しています。',
  invitation_expired: '招待リンクの有効期限が切れています。管理者に再送を依頼してください。',
  account_create_failed: 'アカウントの作成に失敗しました。',
  unexpected: '予期せぬエラーが発生しました。時間をおいて再度お試しください。',
};

/** アプリごとの文言解決（admin は表示言語に応じて非同期に解決する） */
export type AuthErrorMessageResolver = (code: AuthErrorCode) => string | Promise<string>;

/**
 * エラー応答に付ける補足（Supabaseの生メッセージ等）。原因究明用に文言の末尾へ付与する。
 */
export function formatAuthErrorMessage(message: string, detail?: string): string {
  return detail ? `${message} (${detail})` : message;
}
