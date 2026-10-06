import { mailSubject, type MailBlock, type MailContent } from '../layout/document';
import type { MailConfigCheck } from '../dispatch/policy';

/**
 * 運営向けのメール配信の日次の要約（送信の件数・送信失敗・不達・迷惑メールの報告・送信待ちの滞留・設定の状況）。
 * 問題が無い日も毎日、運営のアドレス（admin の環境変数 MAIL_OPS_ALERT_TO）へ送る（packages/lib/mail/dispatch/dailyReport.ts）。
 * 要約が届くこと自体が送信処理の生存確認になる（届かない日は、送信処理の呼び出し・admin・Resend の鍵のいずれかが止まっている）。
 * 日本人・英語ネイティブ双方の運営スタッフが読むため、見出しは日英併記にする（明細は送信の記録そのまま）。
 */

/** 明細の1件 */
export interface MailDailyReportItem {
  /** 日時（日本時間の表記） */
  at: string;
  /** 種類（FAILED・不達等）とメールの種類 */
  label: string;
  /** 宛先（メールアドレス、無ければユーザー名） */
  recipient: string;
  /** 理由 */
  detail: string | null;
}

export interface MailDailyReportProps {
  /** 集計期間の表記（日本時間） */
  periodLabel: string;
  /** 集計期間に送った通知・リマインダーの件数（送信待ちの SENT） */
  sentCount: number;
  /** 集計期間に送らなかった件数（送信待ちの SKIPPED。配信停止・予定の取消・既読等） */
  skippedCount: number;
  /** 送信待ちの FAILED（再試行の上限・宛先の不正） */
  failed: MailDailyReportItem[];
  /** 到達状況の問題（不達・送信失敗・送信停止中の宛先・迷惑メールの報告。招待・パスワード再設定を含む） */
  deliveryProblems: MailDailyReportItem[];
  /** 送る時刻を30分以上過ぎても送られていない送信待ちの件数（送信処理の停止・MAIL_DISPATCH_MODE の設定漏れ等） */
  overdueCount: number;
  /** 送信処理（admin）の設定の状況（policy.ts の checkMailConfig） */
  config: MailConfigCheck[];
}

/** 明細を載せる上限（超えた分は件数だけ） */
export const MAIL_DAILY_REPORT_ITEM_LIMIT = 20;

/** 要確認の件数（送信失敗・到達状況の問題・滞留・設定の不備） */
export function countMailDailyReportIssues({ failed, deliveryProblems, overdueCount, config }: MailDailyReportProps): number {
  return failed.length + deliveryProblems.length + overdueCount + config.filter((check) => !check.ok).length;
}

function dailyReportSubject(total: number): string {
  return mailSubject(
    'bilingual',
    total > 0 ? `メール配信の要確認 ${total}件 / Email delivery issues: ${total}` : 'メール配信の日次報告 異常なし / Daily email report: no issues'
  );
}

function itemsBlocks(title: string, items: MailDailyReportItem[]): MailBlock[] {
  if (items.length === 0) return [];
  const shown = items.slice(0, MAIL_DAILY_REPORT_ITEM_LIMIT);
  const rest = items.length - shown.length;
  return [
    { kind: 'title', text: `${title}（${items.length}）` },
    {
      kind: 'notice',
      items: shown.map((item) => ({ title: `${item.at}  ${item.label}`, text: item.recipient, ...(item.detail ? { sub: item.detail } : null) })),
    },
    ...(rest > 0 ? [{ kind: 'paragraph' as const, text: `ほか ${rest}件 / and ${rest} more`, small: true, muted: true }] : []),
  ];
}

export function buildMailDailyReport(props: MailDailyReportProps): MailContent {
  const { periodLabel, sentCount, skippedCount, failed, deliveryProblems, overdueCount, config } = props;
  const issueCount = countMailDailyReportIssues(props);
  const hasIssues = issueCount > 0;
  const configIssues = config.filter((check) => !check.ok);
  const blocks: MailBlock[] = [
    {
      kind: 'paragraph',
      text: hasIssues
        ? 'メール配信で確認が必要なことがありました。\nThere were email delivery issues that need attention.'
        : 'メール配信に問題はありませんでした。\nNo email delivery issues in the last 24 hours.',
    },
    {
      kind: 'details',
      rows: [
        { label: '集計期間 / Period', value: periodLabel },
        { label: '送信 / Sent', value: String(sentCount) },
        { label: '送らなかった / Skipped', value: String(skippedCount) },
        { label: '送信失敗 / Failed to send', value: String(failed.length) },
        { label: '不達・迷惑メールの報告 / Bounces & complaints', value: String(deliveryProblems.length) },
        { label: '送信の滞留 / Overdue in queue', value: String(overdueCount) },
      ],
    },
    ...itemsBlocks('送信失敗 / Failed to send', failed),
    ...itemsBlocks('不達・迷惑メールの報告 / Bounces & complaints', deliveryProblems),
  ];
  if (overdueCount > 0) {
    blocks.push({
      kind: 'notice',
      items: [
        {
          title: '送信の滞留 / Overdue in queue',
          text: `送る時刻を30分以上過ぎた送信待ちが ${overdueCount}件あります。送信処理の停止、または admin の環境変数 MAIL_DISPATCH_MODE を確認してください。`,
          sub: `${overdueCount} queued email(s) are more than 30 minutes overdue. Check the dispatch job or MAIL_DISPATCH_MODE on the admin app.`,
        },
      ],
    });
  }
  if (configIssues.length > 0) {
    blocks.push({
      kind: 'notice',
      items: configIssues.map((check) => ({
        title: '設定の不備 / Configuration',
        text: `${check.label}: ${check.value}`,
        sub: 'admin の環境変数を確認してください。 / Check the environment variables on the admin app.',
      })),
    });
  }
  blocks.push(
    { kind: 'title', text: '設定の状況 / Configuration' },
    { kind: 'details', rows: config.map((check) => ({ label: check.label, value: check.ok ? check.value : `要確認 / Check: ${check.value}` })) },
    {
      kind: 'paragraph',
      text: '詳細は DB の com_t_mail_outbox（送信待ち）・com_t_mail_event（到達状況）を確認してください。\nSee com_t_mail_outbox and com_t_mail_event for details.',
      small: true,
      muted: true,
    }
  );

  return {
    subject: dailyReportSubject(issueCount),
    doc: {
      language: 'bilingual',
      preheader: hasIssues
        ? `送信失敗 ${failed.length} / 不達・報告 ${deliveryProblems.length} / 滞留 ${overdueCount} / 設定 ${configIssues.length}`
        : `異常なし / 送信 ${sentCount}`,
      headerLabel: '運営 / Operations',
      blocks,
      footer: [
        {
          text: 'このメールは毎日、運営のアドレス（MAIL_OPS_ALERT_TO）へお送りしています。届かない日は、メールの送信処理が止まっている可能性があります。 / Sent to the operations address every day. If it does not arrive, the email dispatch may be down.',
        },
      ],
    },
  };
}
