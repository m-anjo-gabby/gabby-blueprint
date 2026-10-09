import { mailSubject, type MailContent, type MailLocale } from '../layout/document';
import { supportFooter } from '../layout/footers';

/**
 * 管理者向け招待メール。日本人・英語ネイティブ双方のスタッフが受け取るため、日本語・英語を併記する
 * （日本語→英語の順。パスワード再設定メールの admin 向けと同じ方針）。
 */
export interface AdminInviteEmailTemplateProps {
  /** 招待時の氏名。空の場合は「管理者様 / Dear Administrator」 */
  userName: string;
  inviteUrl: string;
  expiresDays: number;
}

const LANGS: MailLocale[] = ['ja', 'en'];

const COPY = {
  ja: {
    greeting: (name: string) => (name ? `${name} 様` : '管理者様'),
    intro: 'Gabby Blueprint 管理画面（Admin Console）への招待が届いています。運営メンバーとして、テナント・ユーザー・契約情報などの管理業務にご利用いただけます。',
    action: '本登録はまだ完了していません。以下のボタンから、管理画面へのログインに使うパスワードを設定してください。',
    button: '管理画面のパスワードを設定する',
    fallback: '※ボタンがクリックできない場合は、以下のURLをブラウザのアドレスバーに貼り付けてください。',
    expiryTitle: '有効期限について',
    expiry: (days: number) =>
      `この招待リンクの有効期限は、メール送信から${days}日間です。期限が切れた場合は、既存の管理者に再発行を依頼してください。`,
    caution: '※管理者権限を扱うアカウントのため、心当たりのない場合はこのメールを破棄し、運営元までご連絡ください。',
  },
  en: {
    greeting: (name: string) => (name ? `Dear ${name},` : 'Dear Administrator,'),
    intro: "You've been invited to the Gabby Blueprint Admin Console, where operations staff manage tenants, users and contracts.",
    action: 'Your registration is not complete yet. Please use the button below to set the password you will use to sign in to the admin console.',
    button: 'Set your admin password',
    fallback: "If the button doesn't work, copy and paste the following URL into your browser's address bar.",
    expiryTitle: 'Link expiration',
    expiry: (days: number) =>
      `This invitation link expires ${days} day${days === 1 ? '' : 's'} after this email was sent. If it has expired, please ask an existing administrator to send a new one.`,
    caution: "This account has administrator privileges. If you weren't expecting this invitation, please discard this email and contact us.",
  },
} as const;

export function buildAdminInviteMail({ userName, inviteUrl, expiresDays }: AdminInviteEmailTemplateProps): MailContent {
  return {
    subject: mailSubject('bilingual', '管理者アカウント招待のご案内 / Invitation to the Admin Console'),
    doc: {
      language: 'bilingual',
      preheader: LANGS.map((lang) => COPY[lang].button).join(' / '),
      headerLabel: '管理画面 / Admin Console',
      blocks: [
        ...LANGS.map((lang) => ({
          kind: 'section' as const,
          lang,
          blocks: [
            { kind: 'paragraph' as const, text: COPY[lang].greeting(userName), strong: true },
            { kind: 'paragraph' as const, text: COPY[lang].intro },
            { kind: 'paragraph' as const, text: COPY[lang].action },
          ],
        })),
        {
          kind: 'button',
          label: LANGS.map((lang) => COPY[lang].button).join(' / '),
          href: inviteUrl,
          fallback: LANGS.map((lang) => COPY[lang].fallback),
        },
        {
          kind: 'notice',
          items: LANGS.map((lang) => ({ title: COPY[lang].expiryTitle, text: COPY[lang].expiry(expiresDays), sub: COPY[lang].caution })),
        },
      ],
      footer: supportFooter(LANGS),
    },
  };
}
