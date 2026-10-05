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

/** メール種別と所属する区分 */
export const MAIL_TYPES = {
  /** グループセッションの24時間前・1時間前（登録: enqueue_event_reminders） */
  GROUP_SESSION_REMINDER: { category: 'REMINDER' },
} as const satisfies Record<string, { category: MailCategory }>;

export type MailType = keyof typeof MAIL_TYPES;

/** メールが1種類以上ある区分（設定画面に出す区分。種別がまだ無い区分の切り替えは出さない） */
export const ACTIVE_MAIL_CATEGORIES: MailCategory[] = (Object.keys(MAIL_CATEGORIES) as MailCategory[]).filter((category) =>
  Object.values(MAIL_TYPES).some((type) => type.category === category)
);

export function isMailCategory(value: string): value is MailCategory {
  return value in MAIL_CATEGORIES;
}
