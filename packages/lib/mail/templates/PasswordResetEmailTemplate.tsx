import * as React from 'react';
import { SUPPORT_EMAIL } from '../../contact';

/** 再設定メールの言語。bilingual は日本語・英語の併記（admin 向け） */
export type PasswordResetMailLanguage = 'ja' | 'en' | 'bilingual';

interface PasswordResetEmailTemplateProps {
  resetUrl: string;
  language: PasswordResetMailLanguage;
  /** 再設定リンクの有効期限（分） */
  expiresInMinutes: number;
}

type Lang = 'ja' | 'en';

function formatExpiry(lang: Lang, minutes: number): string {
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
    contact: 'お問い合わせ先（Gabby Blueprint サポート窓口）',
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
    contact: 'Contact (Gabby Blueprint Support)',
  },
} as const;

/** 件名（言語ごと） */
export const PASSWORD_RESET_SUBJECTS: Record<PasswordResetMailLanguage, string> = {
  ja: '【Gabby Blueprint】パスワード再設定手続きのご案内',
  en: '[Gabby Blueprint] Reset your password',
  bilingual: '【Gabby Blueprint】パスワード再設定のご案内 / Reset your password',
};

const textStyle: React.CSSProperties = { fontSize: '15px', margin: '0 0 16px 0' };

export const PasswordResetEmailTemplate: React.FC<PasswordResetEmailTemplateProps> = ({
  resetUrl,
  language,
  expiresInMinutes,
}) => {
  const langs: Lang[] = language === 'bilingual' ? ['ja', 'en'] : [language];
  const pick = (render: (lang: Lang) => string) => langs.map(render).join(' / ');

  return (
    <div style={{
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      backgroundColor: '#f4f5f7',
      color: '#333333',
      margin: 0,
      padding: '0 0 40px 0',
      width: '100%',
    }}>
      <div style={{
        maxWidth: '600px',
        margin: '40px auto 0 auto',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      }}>
        {/* ヘッダー */}
        <div style={{ backgroundColor: '#0e3196', padding: '32px', textAlign: 'center' }}>
          <h1 style={{ color: '#ffffff', margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
            Gabby Blueprint English
          </h1>
        </div>

        {/* 本文（併記の場合は日本語→英語の順） */}
        <div style={{ padding: '40px 32px', lineHeight: '1.6' }}>
          {langs.map((lang, index) => (
            <div
              key={lang}
              lang={lang}
              style={index > 0 ? { borderTop: '1px solid #e5e7eb', paddingTop: '20px', marginTop: '4px' } : undefined}
            >
              <p style={textStyle}>{COPY[lang].thanks}</p>
              <p style={textStyle}>{COPY[lang].request}</p>
            </div>
          ))}

          {/* ボタンエリア */}
          <div style={{ textAlign: 'center', margin: '32px 0' }}>
            <a
              href={resetUrl}
              style={{
                backgroundColor: '#0e3196',
                color: '#ffffff',
                textDecoration: 'none',
                padding: '14px 36px',
                borderRadius: '6px',
                fontWeight: 'bold',
                display: 'inline-block',
                fontSize: '16px',
              }}
            >
              {pick((lang) => COPY[lang].button)}
            </a>
          </div>

          {/* 企業向けHTML禁止端末 救済用セクション */}
          <div style={{ textAlign: 'center', margin: '0 0 32px 0', padding: '0 16px' }}>
            {langs.map((lang) => (
              <p key={lang} style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px 0' }}>
                {COPY[lang].fallback}
              </p>
            ))}
            <p style={{ fontSize: '13px', margin: 0, wordBreak: 'break-all' }}>
              <a href={resetUrl} style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                {resetUrl}
              </a>
            </p>
          </div>

          {/* 注意事項 */}
          <div style={{
            backgroundColor: '#fffbeb',
            borderLeft: '4px solid #f59e0b',
            padding: '16px',
            margin: '32px 0 0 0',
          }}>
            {langs.map((lang, index) => (
              <div key={lang} style={index > 0 ? { marginTop: '12px' } : undefined}>
                <p style={{ fontSize: '13px', color: '#b45309', margin: 0 }}>
                  <strong>{COPY[lang].expiryTitle}</strong><br />
                  {COPY[lang].expiry(formatExpiry(lang, expiresInMinutes))}
                </p>
                <p style={{ fontSize: '12px', color: '#b45309', margin: '8px 0 0 0' }}>{COPY[lang].ignore}</p>
              </div>
            ))}
          </div>
        </div>

        {/* フッター */}
        <div style={{
          textAlign: 'center',
          padding: '32px 24px',
          fontSize: '12px',
          color: '#9ca3af',
          backgroundColor: '#f9fafb',
          borderTop: '1px solid #e5e7eb',
        }}>
          {langs.map((lang) => (
            <p key={lang} style={{ margin: '0 0 4px 0', lineHeight: '1.5' }}>
              {COPY[lang].contact}:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#9ca3af', textDecoration: 'underline' }}>
                {SUPPORT_EMAIL}
              </a>
            </p>
          ))}
          <p style={{ marginTop: '24px', marginBottom: 0 }}>&copy; Gabby All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};
