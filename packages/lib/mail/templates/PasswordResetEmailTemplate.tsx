import * as React from 'react';

interface PasswordResetEmailTemplateProps {
  resetUrl: string;
  expiresText?: string; // 例: "30分間" や "24時間"
}

export const PasswordResetEmailTemplate: React.FC<PasswordResetEmailTemplateProps> = ({
  resetUrl,
  expiresText = '30分間',
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
            ご利用会員様
          </p>
          
          <p style={{ fontSize: '16px', margin: '0 0 20px 0' }}>
            いつも Gabby Blueprint English をご利用いただきありがとうございます。
          </p>
          <p style={{ fontSize: '16px', margin: '0 0 20px 0' }}>
            パスワードの再設定リクエストを受け付けました。<br />
            お手数ですが、以下のボタンをクリックして新しいパスワードの設定を行ってください。
          </p>
          
          {/* ボタンエリア */}
          <div style={{ textAlign: 'center', margin: '32px 0' }}>
            <a
              href={resetUrl}
              style={{
                backgroundColor: '#ef4444', // ⚠️ 警告・リセット系のアクションのため赤〜オレンジ系の配色が一般的
                color: '#ffffff',
                textDecoration: 'none',
                padding: '14px 36px',
                borderRadius: '6px',
                fontWeight: 'bold',
                display: 'inline-block',
                fontSize: '16px',
                boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.2)',
              }}
            >
              パスワードを再設定する
            </a>
          </div>

          {/* 🚀 企業向けHTML禁止端末 救済用セクション */}
          <div style={{ textAlign: 'center', margin: '0 0 32px 0', padding: '0 16px' }}>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px 0' }}>
              ※ボタンがクリックできない場合は、以下のURLをブラウザのアドレスバーに貼り付けてください。
            </p>
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
            <p style={{ fontSize: '13px', color: '#b45309', margin: 0 }}>
              <strong>⚠️ 有効期限に関するご注意</strong><br />
              この再設定リンクの有効期限は、メール送信から <strong>{expiresText}</strong> です。セキュリティの都合上、期限が切れた場合はリンクが無効化されます。期限が切れた場合は、再度画面から再設定の手続きを行ってください。
            </p>
            <p style={{ fontSize: '12px', color: '#b45309', margin: '8px 0 0 0', borderTop: '1px dashed #fcd34d', paddingTop: '8px' }}>
              ※本リクエストに心当たりがない場合は、このメールを破棄していただければパスワードが変更されることはありません。
            </p>
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
          <p style={{ margin: '0 0 8px 0', lineHeight: '1.5' }}>
            <strong>【お問い合わせ先】</strong><br />
            Gabby Blueprint ササポート窓口:{' '}
            <a href="mailto:support@gabbyacademy.com" style={{ color: '#9ca3af', textDecoration: 'underline' }}>
              support@gabbyacademy.com
            </a>
          </p>
          <p style={{ marginTop: '24px', marginBottom: 0 }}>&copy; Gabby All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};