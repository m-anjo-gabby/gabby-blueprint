// packages/lib/mail/templates/InviteEmailTemplate.tsx
import * as React from 'react';

interface InviteEmailTemplateProps {
  userName: string;
  inviteUrl: string;
  expiresDays: number;
}

export const InviteEmailTemplate: React.FC<InviteEmailTemplateProps> = ({
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
        <div style={{ backgroundColor: '#1e3a8a', padding: '32px', textAlign: 'center' }}>
          <h1 style={{ color: '#ffffff', margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
            Gabby Blueprint English
          </h1>
        </div>
        
        {/* メインコンテンツ */}
        <div style={{ padding: '40px 32px', lineHeight: '1.6' }}>
          <p style={{ fontSize: '16px', margin: '0 0 20px 0', fontWeight: 'bold' }}>
            {userName ? `${userName} 様` : '会員様'}
          </p>
          
          <p style={{ fontSize: '16px', margin: '0 0 20px 0' }}>
            Gabby Blueprint English へようこそ！<br />
            サポート窓口より、あなたのアカウントへの招待が届いています。
          </p>
          <p style={{ fontSize: '16px', margin: '0 0 20px 0' }}>
            まだ本登録手続きは完了していません。以下のボタンをクリックしてメールアドレスを認証し、<strong>パスワードの設定</strong>へお進みください。
          </p>
          
          {/* ボタンエリア */}
          <div style={{ textAlign: 'center', margin: '32px 0' }}>
            <a
              href={inviteUrl}
              style={{
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                textDecoration: 'none',
                padding: '14px 36px',
                borderRadius: '6px',
                fontWeight: 'bold',
                display: 'inline-block',
                fontSize: '16px',
                boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)',
              }}
            >
              メールを認証してパスワードを設定する
            </a>
          </div>

          {/* 🚀 企業向けHTML禁止端末/メーラー崩れ 救済用セクション */}
          {/* HTML上でテキストとしてURLを露出させておくことで、Resendがプレーンテキストに変換した際も完璧にURLが抽出されます */}
          <div style={{ textAlign: 'center', margin: '0 0 32px 0', padding: '0 16px' }}>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px 0' }}>
              ※ボタンがクリックできない場合は、以下のURLからユーザー登録を完了させてください。
            </p>
            <p style={{ fontSize: '13px', margin: 0, wordBreak: 'break-all' }}>
              <a href={inviteUrl} style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                {inviteUrl}
              </a>
            </p>
          </div>
          
          {/* 注意事項 (修正案1ベース：重複なしシンプルな表現) */}
          <div style={{
            backgroundColor: '#fffbeb',
            borderLeft: '4px solid #f59e0b',
            padding: '16px',
            margin: '32px 0 0 0',
          }}>
            <p style={{ fontSize: '13px', color: '#b45309', margin: 0 }}>
              <strong>⚠️ リンクの有効期限に関するご注意</strong><br />
              この招待リンクの有効期限は、メール送信から <strong>{expiresDays}日間</strong> です。期限が切れた場合はリンクが無効化されますので、お手数ですが下記のお問い合わせ先のサポート窓口まで再発行をご依頼ください。
            </p>
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
          <p style={{ margin: '0 0 8px 0', lineHeight: '1.5' }}>
            <strong>【お問い合わせ先】</strong><br />
            Gabby Blueprint サポート窓口:{' '}
            <a href="mailto:support@gabbyacademy.com" style={{ color: '#9ca3af', textDecoration: 'underline' }}>
              support@gabbyacademy.com
            </a>
          </p>
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