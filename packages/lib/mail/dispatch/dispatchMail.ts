import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { USER_TYPES } from '@gabby/types/user';
import { createAdminClient } from '../../supabase/admin';
import { createLogger } from '../../logger';
import { MailSendError, sendCore } from '../core';
import { getPortalBaseUrl } from '../../navigation/portalUrl';
import { buildUnsubscribeUrl, getUnsubscribeSecret, unsubscribeHeaders } from '../unsubscribe/token';
import { MAIL_TYPES, type MailType } from './registry';
import type { MailHandlerRegistry, MailOutboxRow, MailRecipient } from './types';
import {
  classifySendError,
  isAllowedRecipient,
  isExpired,
  isUndeliverableAddress,
  parseAllowlist,
  resolveDispatchMode,
  type MailDispatchMode,
} from './policy';
import { groupSessionReminderHandler } from './handlers/groupSessionReminder';
import { notificationHandler } from './handlers/notification';
import { liveSessionReminderHandler } from './handlers/liveSessionReminder';

const logger = createLogger('mail');

/** 1回の実行で送る上限（送信の間隔と組み立ての時間を含めて、関数の実行時間 60秒に収める） */
const BATCH_SIZE = 30;
/** 送信の試行回数の上限（超えたら FAILED） */
const MAX_ATTEMPTS = 5;
/** 失敗した場合の再試行までの間隔（試行回数 × この分数） */
const RETRY_BACKOFF_MINUTES = 5;
/** 送信の最小間隔（Resend の毎秒の送信数の上限に収める。同時に動いた送信処理が上限を超えた分は、送信数の上限として後で送る） */
const MIN_SEND_INTERVAL_MS = 500;

/** 種別ごとの組み立て処理（registry.ts の MAIL_TYPES と1対1） */
const HANDLERS: MailHandlerRegistry = {
  GROUP_SESSION_REMINDER: groupSessionReminderHandler,
  LIVE_SESSION_REMINDER: liveSessionReminderHandler,
  NOTIFICATION: notificationHandler,
  CHAT_UNREAD: notificationHandler,
};

/** 送信の範囲（MAIL_DISPATCH_MODE と許可リスト。詳細は policy.ts） */
interface DispatchTarget {
  mode: MailDispatchMode;
  allowlist: string[];
}

export interface DispatchSummary {
  mode: MailDispatchMode;
  enqueued: number;
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  deferred: number;
  failed: number;
}

type RowOutcome = 'sent' | 'skipped' | 'retried' | 'deferred' | 'failed';

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
    isLicensed: authUser.user?.app_metadata?.is_licensed === true,
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

async function processRow(
  admin: SupabaseClient,
  row: MailOutboxRow,
  nowMs: number,
  target: DispatchTarget,
  waitForSendSlot: () => Promise<void>
): Promise<RowOutcome> {
  const skip = async (reason: string): Promise<RowOutcome> => {
    await updateRow(admin, row.mail_id, { status: 'SKIPPED', last_error: reason });
    return 'skipped';
  };

  try {
    if (!(row.mail_type in MAIL_TYPES)) return await skip('unknown_mail_type');
    const mailType = row.mail_type as MailType;
    const typeConfig: { category: string; expiresAfterHours?: number } = MAIL_TYPES[mailType];
    if (isExpired(row.insert_date, typeConfig.expiresAfterHours, nowMs)) return await skip('expired');

    const recipient = await loadRecipient(admin, row.user_id);
    if (!recipient) return await skip('recipient_unavailable');
    // ライセンスの無い生徒（契約の終了等）はログインできず、リンクを開いても使えないため送らない
    if (recipient.userType === USER_TYPES.STUDENT && !recipient.isLicensed) return await skip('recipient_unlicensed');
    if (!(await isCategoryEnabled(admin, row.user_id, row.category))) return await skip('opted_out');

    const unsubscribeUrl = buildUnsubscribeUrl({
      portalBaseUrl: getPortalBaseUrl(recipient.userType),
      userId: recipient.userId,
      category: row.category,
      secret: getUnsubscribeSecret(),
    });
    const built = await HANDLERS[mailType]({ admin, row, recipient, nowMs, unsubscribeUrl });
    if ('skip' in built) return await skip(built.skip);
    if (isUndeliverableAddress(recipient.email)) return await skip('undeliverable_address');
    if (!isAllowedRecipient(recipient.email, target.mode, target.allowlist)) return await skip('recipient_not_allowlisted');

    await waitForSendSlot();
    const result = await sendCore({
      to: recipient.email,
      ...built,
      sender: 'notify',
      headers: unsubscribeHeaders(unsubscribeUrl),
      kind: row.mail_type,
      mailId: row.mail_id,
      // 送信の成功後に結果を記録できず、確保したまま残った行を再確保しても、同じメールを二重に送らない
      idempotencyKey: `mail-outbox/${row.mail_id}`,
    });
    await updateRow(admin, row.mail_id, {
      status: 'SENT',
      sent_at: new Date().toISOString(),
      provider_message_id: result?.id ?? null,
      last_error: null,
    });
    return 'sent';
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const action = classifySendError(err instanceof MailSendError ? err.code : null);
    logger.error('mail:dispatch_row_failed', message, {
      payload: { mailId: row.mail_id, mailType: row.mail_type, attempts: row.attempts, action: action.kind },
    });

    if (action.kind === 'sent') {
      // 同じ重複防止キーで送信済み（前回の送信の結果を記録できなかった行）。送り直さずに送信済みとする
      await updateRow(admin, row.mail_id, { status: 'SENT', sent_at: new Date().toISOString(), last_error: 'already_sent' });
      return 'sent';
    }
    if (action.kind === 'defer') {
      // 送信数の上限等は試行回数に数えない（確保の時点で加算した分を戻す）
      await updateRow(admin, row.mail_id, {
        status: 'PENDING',
        attempts: Math.max(row.attempts - 1, 0),
        last_error: message,
        scheduled_at: new Date(nowMs + action.delayMinutes * 60 * 1000).toISOString(),
      });
      return 'deferred';
    }
    const failed = action.kind === 'fail' || row.attempts >= MAX_ATTEMPTS;
    await updateRow(admin, row.mail_id, {
      status: failed ? 'FAILED' : 'PENDING',
      last_error: message,
      scheduled_at: new Date(nowMs + row.attempts * RETRY_BACKOFF_MINUTES * 60 * 1000).toISOString(),
    });
    return failed ? 'failed' : 'retried';
  }
}

/** 送信の最小間隔を守るための待ち（直前の送信から MIN_SEND_INTERVAL_MS 経つまで待つ） */
function createSendThrottle(): () => Promise<void> {
  let lastSentAt = 0;
  return async () => {
    const waitMs = lastSentAt + MIN_SEND_INTERVAL_MS - Date.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastSentAt = Date.now();
  };
}

/**
 * 通知・リマインダーのメールを送る（admin の /api/cron/mail-dispatch から呼ぶ）。
 * 呼び出し元は、すぐ送るメールが積まれた直後（DB のトリガーから pg_net）と、pg_cron の5分ごとのジョブ（送る時刻が来た行がある時だけ）。
 * 1. 時刻で送るメール（グループセッション・ライブセッションのリマインダー）を送信待ちに登録する（enqueue_scheduled_mails。pg_cron でも登録しているが、手元から呼んだ場合も同じ結果になるよう、ここでも行う。重複は一意制約で防ぐ）
 * 2. 送信待ちを確保し（claim_mail_outbox）、1件ずつ配信停止の設定・最新の業務データを確かめて送る
 * 送信の範囲が off（MAIL_DISPATCH_MODE が未設定・off）の場合は 2 を行わない（送信待ちは PENDING のまま残る）。
 */
export async function dispatchMail(): Promise<DispatchSummary> {
  const admin = createAdminClient();
  const target: DispatchTarget = {
    mode: resolveDispatchMode(process.env.MAIL_DISPATCH_MODE),
    allowlist: parseAllowlist(process.env.MAIL_DISPATCH_RECIPIENT_ALLOWLIST),
  };
  const summary: DispatchSummary = { mode: target.mode, enqueued: 0, claimed: 0, sent: 0, skipped: 0, retried: 0, deferred: 0, failed: 0 };

  const { data: enqueued, error: enqueueError } = await admin.rpc('enqueue_scheduled_mails');
  if (enqueueError) logger.error('mail:dispatch_enqueue_failed', enqueueError.message);
  else summary.enqueued = typeof enqueued === 'number' ? enqueued : 0;

  if (target.mode === 'off') {
    logger.warn('mail:dispatch_off', 'MAIL_DISPATCH_MODE が off（または未設定）のため、メールを送りません');
    return summary;
  }

  const { data: rows, error: claimError } = await admin.rpc('claim_mail_outbox', { p_limit: BATCH_SIZE });
  if (claimError) {
    logger.error('mail:dispatch_claim_failed', claimError.message);
    throw new Error(claimError.message);
  }

  const claimed = (rows ?? []) as MailOutboxRow[];
  summary.claimed = claimed.length;
  const nowMs = Date.now();
  // Resend の送信レートに収めるため1件ずつ、間隔を空けて送る
  const waitForSendSlot = createSendThrottle();
  for (const row of claimed) {
    const outcome = await processRow(admin, row, nowMs, target, waitForSendSlot);
    summary[outcome] += 1;
  }

  if (summary.claimed > 0 || summary.enqueued > 0) {
    logger.info('mail:dispatch_done', 'メールの送信処理が完了しました', { payload: { ...summary } });
  }
  return summary;
}
