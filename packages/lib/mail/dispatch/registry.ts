import type { NotificationType } from '@gabby/types/notification';

/**
 * 通知・リマインダーのメールの区分と種別の定義（正本）。
 * DB（com_t_mail_outbox.mail_type / category、com_t_user_mail_setting.category）はフリーテキストのため、値はここで管理する。
 * 新しいメールを追加するときは MAIL_TYPES に種別を足し、送信時の組み立て（dispatch/handlers/）を登録する。
 * 秘密情報を参照しないため、プロフィール画面（クライアント）からも読み込める。
 */

/**
 * 配信区分（利用者が停止できる単位）。
 * アカウント関連（招待・パスワード再設定）は送信待ちを通らず、停止もできないためここには含めない。
 * labels は設定画面の文言（student: ja / coach: en）。
 */
export const MAIL_CATEGORIES = {
  NOTIFICATION: {
    labels: {
      ja: { title: '通知', description: 'チャット・専属コーチのマッチング・セッションの予約やキャンセルなど' },
      en: { title: 'Notifications', description: 'Chat, coach matching, session bookings and cancellations, etc.' },
    },
  },
  REMINDER: {
    labels: {
      ja: { title: 'リマインダー', description: '参加予定のセッションの24時間前と1時間前' },
      en: { title: 'Reminders', description: '24 hours and 1 hour before your upcoming sessions' },
    },
  },
} as const;

export type MailCategory = keyof typeof MAIL_CATEGORIES;

/**
 * メール種別と所属する区分。
 * expiresAfterHours: 送信待ちに積んでからこの時間を過ぎたら送らない（送信処理の停止・送信数の上限で遅れた出来事の通知を、
 * 古い内容のまま送らないため）。リマインダーは送る時点で開始済みなら送らない判定を各組み立て処理が持つため指定しない。
 */
export const MAIL_TYPES = {
  /** グループセッションの24時間前・1時間前（登録: enqueue_event_reminders） */
  GROUP_SESSION_REMINDER: { category: 'REMINDER' },
  /** ライブセッションの24時間前・1時間前（生徒・コーチ。登録: enqueue_live_session_reminders） */
  LIVE_SESSION_REMINDER: { category: 'REMINDER' },
  /** 出来事の通知（予約・キャンセル・マッチング等。登録: アプリ内通知のトリガー enqueue_notification_mail。すぐ送る） */
  NOTIFICATION: { category: 'NOTIFICATION', expiresAfterHours: 24 },
  /** チャットの新着（登録: 同上。未読が10分続いたら1通） */
  CHAT_UNREAD: { category: 'NOTIFICATION', expiresAfterHours: 24 },
} as const satisfies Record<string, { category: MailCategory; expiresAfterHours?: number }>;

/**
 * 通知メールを送るアプリ内通知の種別（宛先は生徒・コーチのみ）。
 * DB 側のトリガー（supabase/DDL/function/enqueue_notification_mail.sql）の一覧と同じにする（変更する場合は両方を直す。
 * 一致は単体テスト testing/unit/mail-dispatch-policy.test.ts で確かめる）。
 * 達成の通知（TRAINING_*）と、管理者の操作による通知（*_BY_ADMIN。fn_notify で登録しない）は含めない。
 */
export const NOTIFICATION_MAIL_TYPES = [
  // 生徒宛て
  'SESSION_CANCELLED_BY_COACH',
  'SESSION_RESCHEDULE_PROPOSED',
  'SESSION_BOOKING_APPROVED',
  'SESSION_BOOKING_REJECTED',
  'MATCHING_APPROVED',
  'MATCHING_REJECTED',
  'MATCHING_EXPIRED',
  'HOMEWORK_POSTED',
  // コーチ宛て
  'SESSION_CANCELLED_BY_STUDENT',
  'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT',
  'SESSION_BOOKED_BY_STUDENT',
  'SESSION_BOOKING_REQUESTED',
  'MATCHING_ASSIGNED_TO_COACH',
  'MATCHING_REQUESTED',
  'COACH_REPORT_APPROVED',
  'COACH_REPORT_APPROVAL_REVOKED',
  // 両方（CHAT_UNREAD として送る）
  'CHAT_NEW_MESSAGE',
] as const satisfies readonly NotificationType[];

export type MailType = keyof typeof MAIL_TYPES;

/** メールが1種類以上ある区分（設定画面に出す区分。種別がまだ無い区分の切り替えは出さない） */
export const ACTIVE_MAIL_CATEGORIES: MailCategory[] = (Object.keys(MAIL_CATEGORIES) as MailCategory[]).filter((category) =>
  Object.values(MAIL_TYPES).some((type) => type.category === category)
);

export function isMailCategory(value: string): value is MailCategory {
  return value in MAIL_CATEGORIES;
}
