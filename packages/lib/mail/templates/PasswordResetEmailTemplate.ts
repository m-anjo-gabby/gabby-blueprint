import { mailSubject, type MailContent, type MailLanguage, type MailLocale } from '../layout/document';
import { supportFooter } from '../layout/footers';

/**
 * 再設定リンクの有効期限（分）。Supabase の Auth 設定「Email OTP Expiration」（supabase/config.toml の otp_expiry）と
 * 合わせること（dev・本番とも 1800秒＝30分）。メール本文の期限表記に使う。
 */
export const PASSWORD_RESET_LINK_TTL_MINUTES = 30;

export interface PasswordResetEmailTemplateProps {
  resetUrl: string;
  /** メールの言語（student: ja / coach: en / admin: bilingual＝日本語・英語の併記） */
  language: MailLanguage;
}

function formatExpiry(lang: MailLocale, minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return lang === 'ja' ? `${hours}時間` : `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return lang === 'ja' ? `${minutes}分間` : `${minutes} minutes`;
}

const COPY = {
  ja: {
    thanks: 'いつも Gabby Blueprint English をご利用いただきありがとうございます。',
    request: 'パスワードの再設定リクエストを受け付けました。以下のボタンから新しいパスワードを設定してください。',
    button: 'パスワードを再設定する',
    fallback: '※ボタンがクリックできない場合は、以下のURLをブラウザのアドレスバーに貼り付けてください。',
    expiryTitle: '有効期限について',
    expiry: (expires: string) =>
      `この再設定リンクの有効期限は、メール送信から${expires}です。期限が切れた場合は、再度ログイン画面の「パスワードをお忘れですか？」から手続きを行ってください。`,
    ignore: '※本リクエストに心当たりがない場合は、このメールを破棄してください。パスワードが変更されることはありません。',
  },
  en: {
    thanks: 'Thank you for using Gabby Blueprint English.',
    request: 'We received a request to reset your password. Please use the button below to set a new password.',
    button: 'Reset password',
    fallback: "If the button doesn't work, copy and paste the following URL into your browser's address bar.",
    expiryTitle: 'Link expiration',
    expiry: (expires: string) =>
      `This reset link expires ${expires} after this email was sent. If it has expired, please start again from "Forgot your password?" on the sign-in page.`,
    ignore: "If you didn't request this, you can safely ignore this email. Your password will not be changed.",
  },
} as const;

/** 件名（言語ごと） */
const SUBJECTS: Record<MailLanguage, string> = {
  ja: 'パスワード再設定手続きのご案内',
  en: 'Reset your password',
  bilingual: 'パスワード再設定のご案内 / Reset your password',
};

/** パスワード再設定（併記の場合は日本語→英語の順） */
export function buildPasswordResetMail({ resetUrl, language }: PasswordResetEmailTemplateProps): MailContent {
  const langs: MailLocale[] = language === 'bilingual' ? ['ja', 'en'] : [language];

  return {
    subject: mailSubject(language, SUBJECTS[language]),
    doc: {
      language,
      preheader: langs.map((lang) => COPY[lang].request).join(' / '),
      blocks: [
        ...langs.map((lang) => ({
          kind: 'section' as const,
          lang,
          blocks: [
            { kind: 'paragraph' as const, text: COPY[lang].thanks },
            { kind: 'paragraph' as const, text: COPY[lang].request },
          ],
        })),
        {
          kind: 'button',
          label: langs.map((lang) => COPY[lang].button).join(' / '),
          href: resetUrl,
          fallback: langs.map((lang) => COPY[lang].fallback),
        },
        {
          kind: 'notice',
          items: langs.map((lang) => ({
            title: COPY[lang].expiryTitle,
            text: COPY[lang].expiry(formatExpiry(lang, PASSWORD_RESET_LINK_TTL_MINUTES)),
            sub: COPY[lang].ignore,
          })),
        },
      ],
      footer: supportFooter(langs),
    },
  };
}
