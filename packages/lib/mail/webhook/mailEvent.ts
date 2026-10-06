/**
 * Resend の Webhook の出来事を、到達状況の記録（record_mail_event の引数）に変換する。
 * 署名の確認・DB を扱わない純粋な変換だけを置き、testing/unit から確かめられるようにする。
 */

/** 記録する出来事（開封・クリックは計測していないため、届いても記録しない。連絡先・ドメインの出来事も対象外） */
export const RECORDED_MAIL_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
] as const;

export type RecordedMailEvent = (typeof RECORDED_MAIL_EVENTS)[number];

/** Webhook の出来事のうち、変換に使う部分（resend の WebhookEventPayload と互換） */
export interface MailWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[];
    subject?: string;
    tags?: Record<string, string>;
    bounce?: { message?: string; type?: string; subType?: string };
    failed?: { reason?: string };
    suppressed?: { message?: string; type?: string };
  };
}

/** record_mail_event の引数 */
export interface MailEventRecord {
  p_webhook_id: string;
  p_event_type: RecordedMailEvent;
  p_provider_message_id: string;
  p_mail_id: string | null;
  p_mail_kind: string | null;
  p_recipient: string | null;
  p_subject: string | null;
  p_detail: string | null;
  p_occurred_at: string;
}

/**
 * 送信した環境のタグ（Resend のタグ env）。Supabase のプロジェクトID（URL のサブドメイン）を使う。
 * Resend の Webhook はアカウント単位で届くため、dev・staging・本番が同じ Resend のアカウントを使うと、
 * 他の環境で送ったメールの出来事も届く。送信時に付けたこのタグで、自分の環境のメールだけを記録する。
 * admin・student・coach は同じ Supabase のプロジェクトを使うため、どのアプリから送っても同じ値になる。
 */
export function mailEnvironmentTag(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    return ref.replace(/[^A-Za-z0-9_-]/g, '_') || null;
  } catch {
    return null;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecordedEvent(type: string): type is RecordedMailEvent {
  return (RECORDED_MAIL_EVENTS as readonly string[]).includes(type);
}

/** 不達・送信失敗・送信停止中の宛先の理由 */
function describeDetail(data: MailWebhookEvent['data']): string | null {
  if (data.bounce) {
    const kind = [data.bounce.type, data.bounce.subType].filter(Boolean).join('/');
    return [kind, data.bounce.message].filter(Boolean).join(': ') || null;
  }
  if (data.failed?.reason) return data.failed.reason;
  if (data.suppressed) return [data.suppressed.type, data.suppressed.message].filter(Boolean).join(': ') || null;
  return null;
}

/**
 * 記録しない出来事・メールのIDが無い出来事・他の環境（タグ env が environment と違う、またはタグが無い）で送ったメールの出来事は null
 */
export function toMailEventRecord(webhookId: string, event: MailWebhookEvent, environment: string | null): MailEventRecord | null {
  if (!isRecordedEvent(event.type) || !event.data.email_id) return null;
  if (!environment || event.data.tags?.env !== environment) return null;
  const mailId = event.data.tags?.mail_id;
  return {
    p_webhook_id: webhookId,
    p_event_type: event.type,
    p_provider_message_id: event.data.email_id,
    p_mail_id: mailId && UUID_PATTERN.test(mailId) ? mailId : null,
    p_mail_kind: event.data.tags?.kind ?? null,
    p_recipient: event.data.to?.[0] ?? null,
    p_subject: event.data.subject ?? null,
    p_detail: describeDetail(event.data),
    p_occurred_at: event.created_at,
  };
}
