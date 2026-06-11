// packages/lib/mail/templates/InviteEmailTemplate.tsx
import * as React from 'react';

interface InviteEmailTemplateProps {
  userName: string;
  inviteUrl: string;
  expiresDays?: number;
}

export const InviteEmailTemplate: React.FC<InviteEmailTemplateProps> = ({
  userName,
  inviteUrl,
  expiresDays = 7,
}) => {
  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      backgroundColor: '#f9fafb',
      padding: '40px 20px',
      color: '#1f2937',
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        maxWidth: '560px',
        margin: '0 auto',
        padding: '32px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
      }}>
        {/* ロゴやブランドヘッダー */}
        <div style={{ marginBottom: '24px', textAlign: 'center' as const }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
            Gabby Blueprint English
          </h1>
        </div>

        <p style={{ fontSize: '16px', lineHeight: '24px', marginBottom: '16px' }}>
          {userName ? `${userName} 様` : '会員様'}
        </p>

        <p style={{ fontSize: '16px', lineHeight: '24px', marginBottom: '24px' }}>
          Gabby Blueprint English へようこそ！<br />
          管理者より、あなたのアカウント招待状が発行されました。<br />
          以下のボタンをクリックしてパスワードを設定し、本登録を完了してください。
        </p>

        {/* コール・トゥ・アクション (CTA) ボタン */}
        <div style={{ textAlign: 'center' as const, margin: '32px 0' }}>
          <a
            href={inviteUrl}
            style={{
              backgroundColor: '#2563eb', // アプリのテーマカラーに合わせて変更してください
              color: '#ffffff',
              padding: '14px 32px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '16px',
              display: 'inline-block',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
            }}
          >
            アカウントを有効化する
          </a>
        </div>

        {/* 注意事項 */}
        <div style={{
          backgroundColor: '#f3f4f6',
          padding: '16px',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#4b5563',
          lineHeight: '20px',
          marginBottom: '24px',
        }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#374151' }}>⚠️ 注意事項</p>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>この招待リンクの有効期限は <strong>{expiresDays}日間</strong> です。</li>
            <li>期限が切れた場合は、お手数ですが管理者へ再送を依頼してください。</li>
          </ul>
        </div>

        <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '18px', borderTop: '1px solid #e5e7eb', paddingTop: '24px', margin: 0 }}>
          ※このメールに心当たりがない場合は、破棄していただくようお願いいたします。<br />
          ※本メールはシステムからの自動配信です。
        </p>
      </div>
    </div>
  );
};