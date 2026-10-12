import type { NotificationType } from '@gabby/types/notification';
import type { MailBlock, MailLocale } from '../layout/document';
import { formatReminderSchedule } from './reminder';
import { formatShortSchedule, formatWeeklySlot } from './scheduleFormat';

/*
 * 出来事の通知メール（予約・キャンセル・マッチング）に載せる対象の情報（日時・振替候補・理由）。
 * メールは他のメールに混ざって単独で読まれるため、何の連絡かが分かるよう、件名と本文に対象の日時を載せる
 * （アプリ内の通知は画面の流れの中で見るため載せない。文面はアプリ内の通知のまま）。
 * 日時はすべて実際の日時（UTC）から、受信者のタイムゾーンで表す。
 * 送信処理（dispatch/handlers/notificationFacts.ts）が業務データから NotificationMailFacts を集め、ここで文面にする。
 */

export interface ScheduleTime {
  startIso: string;
  endIso: string | null;
}

/** 業務データから集めた、通知の対象の情報（種別ごとに使う項目だけを入れる） */
export interface NotificationMailFacts {
  /** 対象のセッション・申請の日時（キャンセル・予約・予約申請・否認された申請） */
  session?: ScheduleTime | null;
  /** キャンセル時の振替候補（未回答のもの、開始の早い順） */
  proposals?: ScheduleTime[];
  /** 振替候補の回答期限 */
  proposalExpiresIso?: string | null;
  /** 毎週の枠の1回分の日時（マッチング成立: 初回のセッション / 否認: 申請した枠の次の回） */
  weekly?: ScheduleTime | null;
  /** 否認の理由（予約申請・マッチング） */
  reason?: string | null;
  /** 生徒が予約申請に添えたメモ（コーチ宛て） */
  message?: string | null;
}

/** メールの件名・本文に足す内容 */
export interface NotificationMailDetails {
  /** 本文の見出しをアプリ内の通知のタイトルから差し替える（キャンセル＋振替候補） */
  title?: string;
  /** 件名の末尾に括弧書きで付ける日時 */
  subjectSuffix: string | null;
  /** 件名の本体をタイトルから差し替える（括弧が重なる場合） */
  subjectBase?: string;
  /** 項目と値の一覧（無ければ出さない） */
  block: Extract<MailBlock, { kind: 'details' }> | null;
}

const COPY = {
  ja: {
    cancelledSession: 'キャンセルされたセッション',
    bookedSession: '予約されたセッション',
    requestedDateTime: 'リクエストした日時',
    requestedSlot: 'ご希望の曜日・時間',
    weeklySlot: '曜日・時間',
    firstSession: '初回のセッション',
    firstPrefix: '初回',
    proposal: (n: number) => `振替候補${n}`,
    reason: '理由',
    message: 'メッセージ',
    expires: (label: string) => `振替候補は ${label} までにお選びください。期限を過ぎると選べなくなります。`,
    rescheduleTitle: 'セッションがキャンセルされました（振替候補あり）',
    rescheduleSubject: 'セッションのキャンセルと振替候補',
  },
  en: {
    cancelledSession: 'Cancelled session',
    bookedSession: 'Booked session',
    requestedDateTime: 'Requested time',
    requestedSlot: 'Requested weekly slot',
    weeklySlot: 'Weekly slot',
    firstSession: 'First session',
    firstPrefix: 'first session',
    proposal: (n: number) => `Alternative time ${n}`,
    reason: 'Reason',
    message: 'Message from the student',
    expires: (label: string) => `Please respond by ${label}. The alternative times can no longer be selected after that.`,
    rescheduleTitle: 'Session cancelled with alternative times',
    rescheduleSubject: 'Session cancelled with alternative times',
  },
} as const;

type Row = { label: string; value: string };

/** 通知の種別と集めた情報から、件名・本文に足す内容を作る（対象外の種別・情報が無い場合は何も足さない） */
export function buildNotificationDetails({
  type,
  facts,
  timeZone,
  language,
}: {
  type: NotificationType;
  facts: NotificationMailFacts;
  timeZone: string;
  language: MailLocale;
}): NotificationMailDetails {
  const copy = COPY[language];
  const full = (time: ScheduleTime) => formatReminderSchedule({ ...time, timeZone, language });
  const short = (time: ScheduleTime) => formatShortSchedule({ startIso: time.startIso, timeZone, language });
  const weekly = (time: ScheduleTime, withZone = true) => formatWeeklySlot({ ...time, timeZone, language, withZone });
  const textRow = (label: string, value: string | null | undefined): Row[] => (value?.trim() ? [{ label, value: value.trim() }] : []);
  const result = (rows: Row[], subjectSuffix: string | null, extra?: Partial<NotificationMailDetails>, note?: string | null) => ({
    subjectSuffix,
    block: rows.length > 0 ? { kind: 'details' as const, rows, note: note ?? null } : null,
    ...extra,
  });

  const { session, weekly: slot } = facts;
  switch (type) {
    case 'SESSION_CANCELLED_BY_COACH':
    case 'SESSION_CANCELLED_BY_STUDENT':
      return session ? result([{ label: copy.cancelledSession, value: full(session) }], short(session)) : result([], null);
    case 'SESSION_RESCHEDULE_PROPOSED':
    case 'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT': {
      // キャンセルと振替候補は1通（キャンセルを主にし、候補はその下に並べる）
      const proposals = facts.proposals ?? [];
      const rows: Row[] = [
        ...(session ? [{ label: copy.cancelledSession, value: full(session) }] : []),
        ...proposals.map((proposal, index) => ({ label: copy.proposal(index + 1), value: full(proposal) })),
      ];
      const expires = proposals.length > 0 && facts.proposalExpiresIso ? copy.expires(short({ startIso: facts.proposalExpiresIso, endIso: null })) : null;
      return result(rows, session ? short(session) : null, { title: copy.rescheduleTitle, subjectBase: copy.rescheduleSubject }, expires);
    }
    case 'SESSION_BOOKED_BY_STUDENT':
    case 'SESSION_BOOKING_APPROVED':
      return session ? result([{ label: copy.bookedSession, value: full(session) }], short(session)) : result([], null);
    case 'SESSION_BOOKING_REQUESTED':
      return session
        ? result([{ label: copy.requestedDateTime, value: full(session) }, ...textRow(copy.message, facts.message)], short(session))
        : result([], null);
    case 'SESSION_BOOKING_REJECTED':
      return result(
        [...(session ? [{ label: copy.requestedDateTime, value: full(session) }] : []), ...textRow(copy.reason, facts.reason)],
        session ? short(session) : null
      );
    case 'MATCHING_APPROVED':
      return slot
        ? result(
            [
              { label: copy.weeklySlot, value: weekly(slot) },
              { label: copy.firstSession, value: full(slot) },
            ],
            `${copy.firstPrefix}${language === 'ja' ? ': ' : ' '}${short(slot)}`
          )
        : result([], null);
    case 'MATCHING_REJECTED':
      return result(
        [...(slot ? [{ label: copy.requestedSlot, value: weekly(slot) }] : []), ...textRow(copy.reason, facts.reason)],
        slot ? weekly(slot, false) : null
      );
    default:
      return result([], null);
  }
}

/** 件名（サービス名の前置きを除いた部分）。日時があれば括弧書きで付ける */
export function notificationSubject(language: MailLocale, base: string, suffix: string | null): string {
  if (!suffix) return base;
  return language === 'ja' ? `${base}（${suffix}）` : `${base} (${suffix})`;
}
