import * as React from 'react';

/*
 * 通知・リマインダーのメール（送信待ちを通るメール）の共通の外枠と部品。
 * ヘッダー・本文の枠・主ボタン・配信停止の案内（フッター）を共有する。
 */

export const mailTextStyle: React.CSSProperties = { fontSize: '15px', margin: '0 0 16px 0' };

/** 主ボタン（中央寄せ） */
export function MailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', margin: '32px 0' }}>
      <a
        href={href}
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
        {children}
      </a>
    </div>
  );
}

interface NotifyMailFrameProps {
  language: 'ja' | 'en';
  /** フッターの「このメールをお送りしている理由」 */
  footerReason: string;
  /** フッターの配信停止の案内 */
  settingsText: string;
  /** メール通知の設定画面のURLと、そのリンクの文言（URLが無い場合はリンクを出さない） */
  settingsUrl: string | null;
  settingsLinkLabel: string;
  children: React.ReactNode;
}

/** 外枠（ヘッダー・本文の枠・フッター） */
export function NotifyMailFrame({ language, footerReason, settingsText, settingsUrl, settingsLinkLabel, children }: NotifyMailFrameProps) {
  return (
    <div
      lang={language}
      style={{
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        backgroundColor: '#f4f5f7',
        color: '#333333',
        margin: 0,
        padding: '0 0 40px 0',
        width: '100%',
      }}
    >
      <div
        style={{
          maxWidth: '600px',
          margin: '40px auto 0 auto',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ backgroundColor: '#0e3196', padding: '32px', textAlign: 'center' }}>
          <h1 style={{ color: '#ffffff', margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Gabby Blueprint English</h1>
        </div>

        <div style={{ padding: '40px 32px', lineHeight: '1.6' }}>
          {children}

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '20px', marginTop: '32px', fontSize: '12px', color: '#6b7280' }}>
            <p style={{ margin: '0 0 8px 0' }}>{footerReason}</p>
            <p style={{ margin: 0 }}>
              {settingsText}
              {settingsUrl && (
                <>
                  {' '}
                  <a href={settingsUrl} style={{ color: '#0e3196' }}>
                    {settingsLinkLabel}
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
