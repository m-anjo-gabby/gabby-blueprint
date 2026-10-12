import { mailSubject, type MailBlock, type MailContent, type MailFooterLine, type MailLocale } from '../layout/document';
import type { MailCategory } from '../dispatch/registry';

/*
 * 通知・リマインダーのメールの共通部分（宛名・配信理由と停止の案内のフッター・件名）。
 * 各テンプレートは本文のブロックと配信理由だけを渡す。
 */

/** 宛先のポータルへのリンク（送信処理が宛先・区分から組み立てる。dispatch/types.ts の MailLinks） */
export interface NotifyMailLinks {
  /** メールの配信設定の画面（プロフィール。ポータルの URL が未設定の環境では null） */
  settingsUrl: string | null;
  /** ログイン不要の配信停止の URL（秘密鍵が未設定の環境では null。無ければ案内を出さない） */
  unsubscribeUrl: string | null;
}

const GREETING: Record<MailLocale, (name: string | null) => string> = {
  ja: (name) => (name ? `${name} さん` : 'Gabby Blueprint English をご利用の皆さま'),
  en: (name) => (name ? `Hi ${name},` : 'Hello,'),
};

/** 設定画面での停止の案内（区分ごと） */
const SETTINGS_COPY: Record<MailCategory, Record<MailLocale, string>> = {
  NOTIFICATION: {
    ja: '通知のメールは、プロフィールの「メール通知」で停止できます（アプリ内の通知は引き続き届きます）。',
    en: 'You can turn off notification emails under "Email notifications" in your profile (in-app notifications will still be delivered).',
  },
  REMINDER: {
    ja: 'リマインダーのメールは、プロフィールの「メール通知」で停止できます。',
    en: 'You can turn off reminder emails under "Email notifications" in your profile.',
  },
};

const FOOTER_COPY = {
  ja: {
    settingsLink: 'メール通知の設定',
    unsubscribe: 'ログインせずに停止する場合は、こちらから停止できます。',
    unsubscribeLink: 'この種類のメールを停止する',
  },
  en: {
    settingsLink: 'Email notification settings',
    unsubscribe: 'You can also unsubscribe without signing in.',
    unsubscribeLink: 'Unsubscribe from these emails',
  },
} as const;

/** フッター（配信理由・設定画面・ワンクリックの配信停止） */
function notifyFooter(language: MailLocale, category: MailCategory, reason: string, links: NotifyMailLinks): MailFooterLine[] {
  const copy = FOOTER_COPY[language];
  const lines: MailFooterLine[] = [
    { text: reason },
    { text: SETTINGS_COPY[category][language], ...(links.settingsUrl ? { link: { label: copy.settingsLink, href: links.settingsUrl } } : null) },
  ];
  if (links.unsubscribeUrl) {
    lines.push({ text: copy.unsubscribe, link: { label: copy.unsubscribeLink, href: links.unsubscribeUrl } });
  }
  return lines;
}

/** 通知・リマインダーのメールを組み立てる（宛名を本文の先頭に付け、区分に合わせたフッターを付ける） */
export function buildNotifyMail({
  language,
  category,
  subject,
  preheader,
  recipientName,
  blocks,
  reason,
  links,
}: {
  language: MailLocale;
  /** 配信区分（停止の案内の文言に使う） */
  category: MailCategory;
  /** 件名（サービス名の前置きを除いた部分） */
  subject: string;
  preheader: string;
  recipientName: string | null;
  /** 宛名の後に続く本文 */
  blocks: MailBlock[];
  /** このメールをお送りしている理由 */
  reason: string;
  links: NotifyMailLinks;
}): MailContent {
  return {
    subject: mailSubject(language, subject),
    doc: {
      language,
      preheader,
      blocks: [{ kind: 'paragraph', text: GREETING[language](recipientName) }, ...blocks],
      footer: notifyFooter(language, category, reason, links),
    },
  };
}
