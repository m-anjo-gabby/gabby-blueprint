import 'server-only';
import { createAdminClient } from '../../supabase/admin';
import { createLogger } from '../../logger';
import { verifyResendWebhook } from '../core';
import { mailEnvironmentTag, toMailEventRecord, type MailWebhookEvent } from './mailEvent';

const logger = createLogger('mail');

/**
 * Resend の Webhook の受け口（admin の app/api/webhooks/resend/route.ts から使う）。
 * 署名（RESEND_WEBHOOK_SECRET）を確かめ、到達状況の出来事を record_mail_event で記録する。
 * - 署名が合わない・鍵が未設定: 401（Resend は再送するが、記録はしない）
 * - 記録に失敗: 500（Resend が時間を空けて再送する。同じ出来事は webhook_id で1件にまとまる）
 * 不達・送信失敗・迷惑メールの報告は warn のログにも出す（送信待ちを通らない招待・パスワード再設定を含む）。
 * 他の環境（同じ Resend のアカウントを使う dev・staging 等）で送ったメールの出来事は記録しない（タグ env。mailEvent.ts）。
 */
export async function handleResendWebhook(req: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signature = req.headers.get('svix-signature');
  if (!secret || !id || !timestamp || !signature) {
    logger.warn('mail:webhook_unauthorized', 'Resend webhook rejected (missing secret or signature headers)');
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const payload = await req.text();
  let event: MailWebhookEvent;
  try {
    event = verifyResendWebhook({ payload, headers: { id, timestamp, signature }, webhookSecret: secret }) as MailWebhookEvent;
  } catch (err) {
    logger.warn('mail:webhook_invalid_signature', err instanceof Error ? err.message : 'Invalid signature', { err });
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const record = toMailEventRecord(id, event, mailEnvironmentTag(process.env.NEXT_PUBLIC_SUPABASE_URL));
  if (!record) return Response.json({ recorded: false });

  const admin = createAdminClient();
  const { data: recorded, error } = await admin.rpc('record_mail_event', record);
  if (error) {
    logger.error('mail:webhook_record_failed', error.message, { err: error, payload: { webhookId: id, eventType: record.p_event_type } });
    return Response.json({ error: 'record_failed' }, { status: 500 });
  }

  if (recorded && ['email.bounced', 'email.failed', 'email.complained', 'email.suppressed'].includes(record.p_event_type)) {
    logger.warn('mail:delivery_problem', `${record.p_event_type}: ${record.p_detail ?? ''}`, {
      payload: {
        eventType: record.p_event_type,
        kind: record.p_mail_kind,
        mailId: record.p_mail_id,
        messageId: record.p_provider_message_id,
        recipient: record.p_recipient,
      },
    });
  }
  return Response.json({ recorded: recorded === true });
}
