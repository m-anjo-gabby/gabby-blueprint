import { handleResendWebhook } from '@gabby/lib/mail/webhook/handleResendWebhook';

export const dynamic = 'force-dynamic';

/**
 * Resend の Webhook（メールの到達状況。本体は packages/lib/mail/webhook/handleResendWebhook.ts）。
 * ログインは不要で、Webhook の署名（RESEND_WEBHOOK_SECRET）で保護する（proxy で公開ルートにする）。
 */
export async function POST(req: Request) {
  return handleResendWebhook(req);
}
