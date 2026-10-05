import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '../../supabase/admin';
import { createLogger } from '../../logger';
import { sendCore } from '../core';
import { MAIL_TYPES, type MailType } from './registry';
import type { MailHandlerRegistry, MailOutboxRow, MailRecipient } from './types';
import { groupSessionReminderHandler } from './handlers/groupSessionReminder';
import { notificationHandler } from './handlers/notification';

const logger = createLogger('mail');

/** 1回の実行で送る上限（Resend の送信レート・関数の実行時間に収める） */
const BATCH_SIZE = 40;
/** 送信の試行回数の上限（超えたら FAILED） */
const MAX_ATTEMPTS = 5;
/** 失敗した場合の再試行までの間隔（試行回数 × この分数） */
const RETRY_BACKOFF_MINUTES = 5;

/** 種別ごとの組み立て処理（registry.ts の MAIL_TYPES と1対1） */
const HANDLERS: MailHandlerRegistry = {
  GROUP_SESSION_REMINDER: groupSessionReminderHandler,
  NOTIFICATION: notificationHandler,
  CHAT_UNREAD: notificationHandler,
};

/**
 * 送らない宛先。テスト用の固定アカウント（予約済みドメイン .example 等）へ送るとバウンスで送信元ドメインの評価が下がるため、
 * 送信待ちには残したうえで SKIPPED にする（testing/e2e/CONVENTIONS.md 2章）。
 */
function isUndeliverableAddress(email: string): boolean {
  return /\.(example|test|invalid|localhost)$/i.test(email.trim());
}

/**
 * 送信先のドメインの許可リスト（環境変数 MAIL_DISPATCH_RECIPIENT_ALLOWLIST、カンマ区切り。例: resend.dev）。
 * dev・staging の DB には実在の人のアドレスが含まれうるため、設定した環境では許可したドメインにだけ送る。
 * 未設定（本番）は制限しない。
 */
function isAllowedRecipient(email: string): boolean {
  const allowlist = (process.env.MAIL_DISPATCH_RECIPIENT_ALLOWLIST ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return true;
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  return allowlist.includes(domain);
}

export interface DispatchSummary {
  enqueued: number;
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
}

type RowOutcome = 'sent' | 'skipped' | 'retried' | 'failed';

async function updateRow(admin: SupabaseClient, mailId: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await admin
    .from('com_t_mail_outbox')
    .update({ ...values, locked_at: null, update_date: new Date().toISOString() })
    .eq('mail_id', mailId);
  if (error) logger.error('mail:dispatch_update_failed', error.message, { payload: { mailId } });
}

async function loadRecipient(admin: SupabaseClient, userId: string): Promise<MailRecipient | null> {
  const { data: user, error } = await admin
    .from('com_m_user')
    .select('user_type, user_name, timezone, delete_flg')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`recipient_fetch_failed: ${error.message}`);
  if (!user || user.delete_flg !== '0') return null;

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError) throw new Error(`recipient_auth_fetch_failed: ${authError.message}`);
  const email = authUser.user?.email;
  if (!email) return null;

  return {
    userId,
    email,
    userType: user.user_type ?? '1',
    userName: user.user_name,
    timezone: user.timezone || 'Asia/Tokyo',
  };
}

async function isCategoryEnabled(admin: SupabaseClient, userId: string, category: string): Promise<boolean> {
  const { data, error } = await admin
    .from('com_t_user_mail_setting')
    .select('enabled')
    .eq('user_id', userId)
    .eq('category', category)
    .maybeSingle();
  if (error) throw new Error(`mail_setting_fetch_failed: ${error.message}`);
  // 行が無い区分は配信する（初期値オン）
  return data?.enabled ?? true;
}

async function processRow(admin: SupabaseClient, row: MailOutboxRow, nowMs: number): Promise<RowOutcome> {
  const skip = async (reason: string): Promise<RowOutcome> => {
    await updateRow(admin, row.mail_id, { status: 'SKIPPED', last_error: reason });
    return 'skipped';
  };

  try {
    if (!(row.mail_type in MAIL_TYPES)) return await skip('unknown_mail_type');
    const handler = HANDLERS[row.mail_type as MailType];

    const recipient = await loadRecipient(admin, row.user_id);
    if (!recipient) return await skip('recipient_unavailable');
    if (!(await isCategoryEnabled(admin, row.user_id, row.category))) return await skip('opted_out');

    const built = await handler({ admin, row, recipient, nowMs });
    if ('skip' in built) return await skip(built.skip);
    if (isUndeliverableAddress(recipient.email)) return await skip('undeliverable_address');
    if (!isAllowedRecipient(recipient.email)) return await skip('recipient_not_allowlisted');

    const result = await sendCore({ to: recipient.email, subject: built.subject, html: built.html, sender: 'notify' });
    await updateRow(admin, row.mail_id, {
      status: 'SENT',
      sent_at: new Date().toISOString(),
      provider_message_id: result?.id ?? null,
      last_error: null,
    });
    return 'sent';
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const failed = row.attempts >= MAX_ATTEMPTS;
    logger.error('mail:dispatch_row_failed', message, { payload: { mailId: row.mail_id, mailType: row.mail_type, attempts: row.attempts } });
    await updateRow(admin, row.mail_id, {
      status: failed ? 'FAILED' : 'PENDING',
      last_error: message,
      scheduled_at: new Date(nowMs + row.attempts * RETRY_BACKOFF_MINUTES * 60 * 1000).toISOString(),
    });
    return failed ? 'failed' : 'retried';
  }
}

/**
 * 通知・リマインダーのメールを送る（admin の /api/cron/mail-dispatch から呼ぶ）。
 * 呼び出し元は、すぐ送るメールが積まれた直後（DB のトリガーから pg_net）と、pg_cron の5分ごとのジョブ（送る時刻が来た行がある時だけ）。
 * 1. リマインダーを送信待ちに登録する（pg_cron でも登録しているが、手元から呼んだ場合も同じ結果になるよう、ここでも行う。重複は一意制約で防ぐ）
 * 2. 送信待ちを確保し（claim_mail_outbox）、1件ずつ配信停止の設定・最新の業務データを確かめて送る
 */
export async function dispatchMail(): Promise<DispatchSummary> {
  const admin = createAdminClient();
  const summary: DispatchSummary = { enqueued: 0, claimed: 0, sent: 0, skipped: 0, retried: 0, failed: 0 };

  const { data: enqueued, error: enqueueError } = await admin.rpc('enqueue_event_reminders');
  if (enqueueError) logger.error('mail:dispatch_enqueue_failed', enqueueError.message);
  else summary.enqueued = typeof enqueued === 'number' ? enqueued : 0;

  const { data: rows, error: claimError } = await admin.rpc('claim_mail_outbox', { p_limit: BATCH_SIZE });
  if (claimError) {
    logger.error('mail:dispatch_claim_failed', claimError.message);
    throw new Error(claimError.message);
  }

  const claimed = (rows ?? []) as MailOutboxRow[];
  summary.claimed = claimed.length;
  const nowMs = Date.now();
  // Resend の送信レートに収めるため1件ずつ送る
  for (const row of claimed) {
    const outcome = await processRow(admin, row, nowMs);
    summary[outcome] += 1;
  }

  if (summary.claimed > 0 || summary.enqueued > 0) {
    logger.info('mail:dispatch_done', 'メールの送信処理が完了しました', { payload: { ...summary } });
  }
  return summary;
}
