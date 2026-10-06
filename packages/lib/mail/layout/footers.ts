import { SUPPORT_EMAIL } from '../../contact';
import type { MailFooterLine, MailLocale } from './document';

/*
 * アカウント関連（招待・パスワード再設定）のフッターの定型文（問い合わせ先）。
 * 通知・リマインダーのフッター（配信停止の案内）は templates/notifyMail.ts。
 */

const SUPPORT_LABEL = {
  ja: 'お問い合わせ先（Gabby Blueprint サポート窓口）:',
  en: 'Contact (Gabby Blueprint Support):',
} as const;

/** アカウント関連（招待・パスワード再設定）のフッター（問い合わせ先。併記は言語の順に並べる） */
export function supportFooter(langs: MailLocale[]): MailFooterLine[] {
  return langs.map((lang) => ({ text: SUPPORT_LABEL[lang], link: { label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` } }));
}
