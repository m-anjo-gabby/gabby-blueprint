import type { MailBlock, MailDocument } from '../layout/document';

/**
 * 運営向けのメールの日次の要約（送信失敗・不達・迷惑メールの報告・送信待ちの滞留）。
 * 問題が1件以上あった日だけ、運営のアドレス（admin の環境変数 MAIL_OPS_ALERT_TO）へ送る（packages/lib/mail/dispatch/dailyReport.ts）。
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
  /** 送信待ちの FAILED（再試行の上限・宛先の不正） */
  failed: MailDailyReportItem[];
  /** 到達状況の問題（不達・送信失敗・送信停止中の宛先・迷惑メールの報告。招待・パスワード再設定を含む） */
  deliveryProblems: MailDailyReportItem[];
  /** 送る時刻を30分以上過ぎても送られていない送信待ちの件数（送信処理の停止・MAIL_DISPATCH_MODE の設定漏れ等） */
  overdueCount: number;
}

/** 明細を載せる上限（超えた分は件数だけ） */
export const MAIL_DAILY_REPORT_ITEM_LIMIT = 20;

export function hasMailDailyReportIssues({ failed, deliveryProblems, overdueCount }: MailDailyReportProps): boolean {
  return failed.length > 0 || deliveryProblems.length > 0 || overdueCount > 0;
}

export function getMailDailyReportSubject({ failed, deliveryProblems, overdueCount }: MailDailyReportProps): string {
  const total = failed.length + deliveryProblems.length + overdueCount;
  return `【Gabby Blueprint】メール配信の要確認 ${total}件 / Email delivery issues: ${total}`;
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

export function buildMailDailyReport(props: MailDailyReportProps): MailDocument {
  const { periodLabel, failed, deliveryProblems, overdueCount } = props;
  const blocks: MailBlock[] = [
    { kind: 'paragraph', text: `メール配信で確認が必要なことがありました。\nThere were email delivery issues that need attention.` },
    {
      kind: 'details',
      rows: [
        { label: '集計期間 / Period', value: periodLabel },
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
  blocks.push({
    kind: 'paragraph',
    text: '詳細は DB の com_t_mail_outbox（送信待ち）・com_t_mail_event（到達状況）を確認してください。\nSee com_t_mail_outbox and com_t_mail_event for details.',
    small: true,
    muted: true,
  });

  return {
    language: 'bilingual',
    preheader: `送信失敗 ${failed.length} / 不達・報告 ${deliveryProblems.length} / 滞留 ${overdueCount}`,
    headerLabel: '運営 / Operations',
    blocks,
    footer: [
      {
        text: 'このメールは、メール配信に問題があった日に運営のアドレス（MAIL_OPS_ALERT_TO）へお送りしています。 / Sent to the operations address only on days with delivery issues.',
      },
    ],
  };
}
