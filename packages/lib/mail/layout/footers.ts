import { SUPPORT_EMAIL } from '../../contact';
import type { MailFooterLine } from './document';

/*
 * フッターの定型文（通知・リマインダー＝配信停止の案内 / アカウント関連＝問い合わせ先）
 */

const UNSUBSCRIBE_COPY = {
  ja: { text: 'ログインせずに停止する場合は、こちらから停止できます。', label: 'この種類のメールを停止する' },
  en: { text: 'You can also unsubscribe without signing in.', label: 'Unsubscribe from these emails' },
} as const;

/** 通知・リマインダーのフッター（配信理由・設定画面・ワンクリックの配信停止） */
export function notifyFooter({
  language,
  reason,
  settingsText,
  settingsUrl,
  settingsLabel,
  unsubscribeUrl,
}: {
  language: 'ja' | 'en';
  /** このメールをお送りしている理由 */
  reason: string;
  /** 設定画面での停止の案内 */
  settingsText: string;
  /** メール通知の設定画面（宛先のポータル。無ければリンクを出さない） */
  settingsUrl: string | null;
  settingsLabel: string;
  /** ログイン不要の配信停止の URL（dispatch が組み立てる。秘密鍵が未設定の環境では null） */
  unsubscribeUrl?: string | null;
}): MailFooterLine[] {
  const lines: MailFooterLine[] = [
    { text: reason },
    { text: settingsText, ...(settingsUrl ? { link: { label: settingsLabel, href: settingsUrl } } : null) },
  ];
  if (unsubscribeUrl) {
    const copy = UNSUBSCRIBE_COPY[language];
    lines.push({ text: copy.text, link: { label: copy.label, href: unsubscribeUrl } });
  }
  return lines;
}

const SUPPORT_LABEL = {
  ja: 'お問い合わせ先（Gabby Blueprint サポート窓口）:',
  en: 'Contact (Gabby Blueprint Support):',
} as const;

/** アカウント関連（招待・パスワード再設定）のフッター（問い合わせ先。併記は言語の順に並べる） */
export function supportFooter(langs: ('ja' | 'en')[]): MailFooterLine[] {
  return langs.map((lang) => ({ text: SUPPORT_LABEL[lang], link: { label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` } }));
}
