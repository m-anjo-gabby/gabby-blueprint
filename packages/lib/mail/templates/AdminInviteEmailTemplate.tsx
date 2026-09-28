// packages/lib/mail/templates/AdminInviteEmailTemplate.tsx
import * as React from 'react';
import { SUPPORT_EMAIL } from '../../contact';

/**
 * 管理者向け招待メール。日本人・英語ネイティブ双方のスタッフが受け取るため、日本語・英語を併記する
 * （日本語→英語の順。パスワード再設定メールの admin 向けと同じ方針）。
 */
interface AdminInviteEmailTemplateProps {
  /** 招待時の氏名。空の場合は「管理者様 / Dear Administrator」 */
  userName: string;
  inviteUrl: string;
  expiresDays: number;
}

type Lang = 'ja' | 'en';
const LANGS: Lang[] = ['ja', 'en'];

const COPY = {
  ja: {
    greeting: (name: string) => (name ? `${name} 様` : '管理者様'),
    intro: 'Gabby Blueprint English 管理画面（Admin Console）への招待が届いています。運営メンバーとして、テナント・ユーザー・契約情報などの管理業務にご利用いただけます。',
    action: '本登録はまだ完了していません。以下のボタンから、管理画面へのログインに使うパスワードを設定してください。',
    button: '管理画面のパスワードを設定する',
    fallback: '※ボタンがクリックできない場合は、以下のURLをブラウザのアドレスバーに貼り付けてください。',
    expiryTitle: '有効期限について',
    expiry: (days: number) =>
      `この招待リンクの有効期限は、メール送信から${days}日間です。期限が切れた場合は、既存の管理者に再発行を依頼してください。`,
    caution: '※管理者権限を扱うアカウントのため、心当たりのない場合はこのメールを破棄し、運営元までご連絡ください。',
    contact: 'お問い合わせ先（Gabby Blueprint サポート窓口）',
  },
  en: {
    greeting: (name: string) => (name ? `Dear ${name},` : 'Dear Administrator,'),
    intro: "You've been invited to the Gabby Blueprint English Admin Console, where operations staff manage tenants, users and contracts.",
    action: 'Your registration is not complete yet. Please use the button below to set the password you will use to sign in to the admin console.',
    button: 'Set your admin password',
    fallback: "If the button doesn't work, copy and paste the following URL into your browser's address bar.",
    expiryTitle: 'Link expiration',
    expiry: (days: number) =>
      `This invitation link expires ${days} day${days === 1 ? '' : 's'} after this email was sent. If it has expired, please ask an existing administrator to send a new one.`,
    caution: "This account has administrator privileges. If you weren't expecting this invitation, please discard this email and contact us.",
    contact: 'Contact (Gabby Blueprint Support)',
  },
} as const;

/** 件名（日英併記） */
export const ADMIN_INVITATION_SUBJECT = '【Gabby Blueprint】管理者アカウント招待のご案内 / Invitation to the Admin Console';

const textStyle: React.CSSProperties = { fontSize: '15px', margin: '0 0 16px 0' };

export const AdminInviteEmailTemplate: React.FC<AdminInviteEmailTemplateProps> = ({
  userName,
  inviteUrl,
  expiresDays,
}) => {
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
          <p style={{ color: '#c7d2fe', margin: '4px 0 0 0', fontSize: '13px', fontWeight: 'bold' }}>
            管理画面 / Admin Console
          </p>
        </div>

        {/* 本文（日本語→英語） */}
        <div style={{ padding: '40px 32px', lineHeight: '1.6' }}>
          {LANGS.map((lang, index) => (
            <div
              key={lang}
              lang={lang}
              style={index > 0 ? { borderTop: '1px solid #e5e7eb', paddingTop: '20px', marginTop: '4px' } : undefined}
            >
              <p style={{ ...textStyle, fontWeight: 'bold' }}>{COPY[lang].greeting(userName)}</p>
              <p style={textStyle}>{COPY[lang].intro}</p>
              <p style={textStyle}>{COPY[lang].action}</p>
            </div>
          ))}

          {/* ボタンエリア */}
          <div style={{ textAlign: 'center', margin: '32px 0' }}>
            <a
              href={inviteUrl}
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
              {LANGS.map((lang) => COPY[lang].button).join(' / ')}
            </a>
          </div>

          {/* 企業向けHTML禁止端末/メーラー崩れ 救済用セクション */}
          <div style={{ textAlign: 'center', margin: '0 0 32px 0', padding: '0 16px' }}>
            {LANGS.map((lang) => (
              <p key={lang} style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px 0' }}>
                {COPY[lang].fallback}
              </p>
            ))}
            <p style={{ fontSize: '13px', margin: 0, wordBreak: 'break-all' }}>
              <a href={inviteUrl} style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                {inviteUrl}
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
            {LANGS.map((lang, index) => (
              <div key={lang} style={index > 0 ? { marginTop: '12px' } : undefined}>
                <p style={{ fontSize: '13px', color: '#b45309', margin: 0 }}>
                  <strong>{COPY[lang].expiryTitle}</strong><br />
                  {COPY[lang].expiry(expiresDays)}
                </p>
                <p style={{ fontSize: '12px', color: '#b45309', margin: '8px 0 0 0' }}>{COPY[lang].caution}</p>
              </div>
            ))}
          </div>
        </div>

        {/* フッターエリア */}
        <div style={{
          textAlign: 'center',
          padding: '32px 24px',
          fontSize: '12px',
          color: '#9ca3af',
          backgroundColor: '#f9fafb',
          borderTop: '1px solid #e5e7eb',
        }}>
          {LANGS.map((lang) => (
            <p key={lang} style={{ margin: '0 0 4px 0', lineHeight: '1.5' }}>
              {COPY[lang].contact}:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#9ca3af', textDecoration: 'underline' }}>
                {SUPPORT_EMAIL}
              </a>
            </p>
          ))}
          <p style={{ marginTop: '16px', marginBottom: '8px' }}>
            <strong>株式会社ギャビーアカデミー / Gabby Academy Co., Ltd.</strong><br />
            <a href="https://gabbyacademy.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#9ca3af', textDecoration: 'underline' }}>
              https://gabbyacademy.com/
            </a>
          </p>
          <p style={{ marginTop: '24px', marginBottom: 0 }}>&copy; Gabby All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};
