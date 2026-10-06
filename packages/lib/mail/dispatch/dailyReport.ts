import 'server-only';
import { createAdminClient } from '../../supabase/admin';
import { createLogger } from '../../logger';
import { REPORTING_TIMEZONE } from '../../date/reporting';
import { sendCore } from '../core';
import { renderMailDailyReportEmail } from '../render';
import { hasMailDailyReportIssues, type MailDailyReportItem } from '../templates/MailDailyReportTemplate';

const logger = createLogger('mail');

/** 集計期間（実行時刻から遡る時間） */
const REPORT_WINDOW_HOURS = 24;
/** 送る時刻をこれ以上過ぎた送信待ちを「滞留」とみなす */
const OVERDUE_MINUTES = 30;

/** 到達状況の問題として載せる出来事と表記 */
const DELIVERY_PROBLEM_LABELS: Record<string, string> = {
  'email.bounced': '不達 / Bounced',
  'email.failed': '送信失敗 / Failed',
  'email.suppressed': '送信停止中の宛先 / Suppressed',
  'email.complained': '迷惑メールの報告 / Complaint',
};

function formatJst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: REPORTING_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** 運営のアドレス（admin の環境変数 MAIL_OPS_ALERT_TO、カンマ区切り） */
function opsRecipients(): string[] {
  return (process.env.MAIL_OPS_ALERT_TO ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
}

export type MailDailyReportResult = { sent: number } | { skip: 'no_recipient' | 'no_issues' };

/**
 * 運営向けのメール配信の日次の要約（pg_cron の毎日のジョブ 'mail-daily-report' が送信処理を task=daily_report で呼ぶ）。
 * 直近24時間の送信失敗（送信待ちの FAILED）・到達状況の問題（不達・送信失敗・送信停止中の宛先・迷惑メールの報告。
 * 招待・パスワード再設定を含む）と、送信待ちの滞留を集計し、1件以上ある場合だけ運営のアドレスへ送る。
 * 運営宛ての社内向けのメールのため、MAIL_DISPATCH_MODE（利用者への通知の送信の範囲）の対象外。宛先が未設定なら送らない。
 */
export async function sendMailDailyReport(nowMs = Date.now()): Promise<MailDailyReportResult> {
  const recipients = opsRecipients();
  if (recipients.length === 0) return { skip: 'no_recipient' };

  const admin = createAdminClient();
  const since = new Date(nowMs - REPORT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const overdueBefore = new Date(nowMs - OVERDUE_MINUTES * 60 * 1000).toISOString();

  const [failedResult, eventResult, overdueResult] = await Promise.all([
    admin
      .from('com_t_mail_outbox')
      .select('mail_type, last_error, update_date, user:com_m_user(user_name)')
      .eq('status', 'FAILED')
      .gte('update_date', since)
      .order('update_date', { ascending: false }),
    admin
      .from('com_t_mail_event')
      .select('event_type, mail_kind, recipient, detail, occurred_at')
      .in('event_type', Object.keys(DELIVERY_PROBLEM_LABELS))
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false }),
    admin
      .from('com_t_mail_outbox')
      .select('mail_id', { count: 'exact', head: true })
      .eq('status', 'PENDING')
      .lt('scheduled_at', overdueBefore),
  ]);
  const queryError = failedResult.error ?? eventResult.error ?? overdueResult.error;
  if (queryError) throw new Error(`mail_daily_report_query_failed: ${queryError.message}`);

  const failed: MailDailyReportItem[] = (failedResult.data ?? []).map((row) => {
    const user = Array.isArray(row.user) ? row.user[0] : row.user;
    return {
      at: formatJst(row.update_date),
      label: `FAILED ${row.mail_type}`,
      recipient: user?.user_name ?? '(unknown user)',
      detail: row.last_error,
    };
  });
  const deliveryProblems: MailDailyReportItem[] = (eventResult.data ?? []).map((row) => ({
    at: formatJst(row.occurred_at),
    label: `${DELIVERY_PROBLEM_LABELS[row.event_type] ?? row.event_type}${row.mail_kind ? `  ${row.mail_kind}` : ''}`,
    recipient: row.recipient ?? '(unknown)',
    detail: row.detail,
  }));
  const props = {
    periodLabel: `${formatJst(since)} 〜 ${formatJst(new Date(nowMs).toISOString())}（日本時間 / JST）`,
    failed,
    deliveryProblems,
    overdueCount: overdueResult.count ?? 0,
  };
  if (!hasMailDailyReportIssues(props)) return { skip: 'no_issues' };

  // 1日1回のジョブから呼ぶため、重複防止キーは付けない（同じ日に手動で再実行した場合は、その時点の内容で送る）
  const rendered = renderMailDailyReportEmail(props);
  for (const to of recipients) {
    await sendCore({ to, ...rendered, sender: 'notify', kind: 'ops_daily_report' });
  }
  logger.info('mail:daily_report_sent', 'メール配信の日次の要約を送りました', {
    payload: { recipients: recipients.length, failed: failed.length, deliveryProblems: deliveryProblems.length, overdue: props.overdueCount },
  });
  return { sent: recipients.length };
}
