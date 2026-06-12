// packages/lib/mail/core.ts
import { Resend } from 'resend';

// APIキーがない（開発初期や未設定環境）場合はnullにしておき、関数内で安全にガード
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface SendCoreParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * 🛠️ メール送信の共通基盤（コア）関数
 * html のみを Resend に渡すことで、プレーンテキスト版は Resend 側で自動生成されます。
 */
export async function sendCore({ to, subject, html }: SendCoreParams) {
  if (!resend) {
    throw new Error('mail:core: RESEND_API_KEY が環境変数に定義されていません。');
  }

  // 送信元アドレス（先ほどの環境変数名に同期）
  const from = process.env.MAIL_FROM_AUTH || 'Gabby Academy <noreply@mail.gabbyacademy.com>';

  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    // 💡 text フィールドを明示的に省略することで、Resendの「HTML to Text 優秀自動変換」が機能します
  });

  if (error) {
    throw new Error(`mail:core:api_failed: ${error.message}`);
  }

  return data;
}