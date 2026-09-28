import type { AuthErrorCode } from '../../auth/errors';

/**
 * 認証画面（ログイン・パスワード忘れ・再設定・招待）の文言
 *
 * 共通部品は特定の言語を持たず、各アプリがこの型に沿って文言を渡す
 * （admin: next-intl / coach: 英語の定数 / student: 日本語の定数）。
 */

/** 新しいパスワード欄（新パスワード＋確認用） */
export interface PasswordFieldLabels {
  newPassword: string;
  confirmPassword: string;
  /** 新パスワード欄の下に常に出す条件の案内 */
  requirement: string;
  tooShort: string;
  needsAlnum: string;
  match: string;
  mismatch: string;
}

export interface LoginLabels {
  subtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  forgotPassword: string;
  submit: string;
  submitting: string;
  invalidLinkTitle: string;
  invalidLinkBody: string;
  passwordUpdatedNotice: string;
  linkErrorNotice: string;
}

export interface ForgotPasswordLabels {
  title: string;
  description: string;
  emailLabel: string;
  emailPlaceholder: string;
  submit: string;
  submitting: string;
  sentTitle: string;
  sentBody: string;
  backToLogin: string;
}

export interface UpdatePasswordLabels {
  verifying: string;
  guideTitle: string;
  guideBody: string;
  guideAction: string;
  formTitle: string;
  formDescription: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  successAction: string;
  invalidTitle: string;
  invalidBody: string;
  invalidAction: string;
  backToLogin: string;
  networkError: string;
}

export interface InviteLabels {
  verifying: string;
  formTitle: string;
  /** 氏名・メールアドレスを含む案内文 */
  formDescription: (params: { name: string; email: string }) => string;
  /** 招待に氏名が無い場合の呼び方 */
  fallbackName: string;
  submit: string;
  submitting: string;
  expiredTitle: string;
  invalidTitle: string;
  backToLogin: string;
  unexpected: string;
}

export interface AuthLabels {
  login: LoginLabels;
  forgotPassword: ForgotPasswordLabels;
  updatePassword: UpdatePasswordLabels;
  invite: InviteLabels;
  passwordFields: PasswordFieldLabels;
}

/** 認証アクションの戻り値（各アプリの *AuthAction.ts） */
export interface AuthActionResult {
  success?: boolean;
  error?: string;
  errorCode?: AuthErrorCode;
}

export type FormAuthAction = (formData: FormData) => Promise<AuthActionResult | undefined | void>;

/** 招待トークンの確認結果（画面に必要な項目だけ） */
export type InvitationCheckResult =
  | { valid: true; invitation: { email: string; userName: string | null } }
  | { valid: false; errorCode: AuthErrorCode; error: string };
