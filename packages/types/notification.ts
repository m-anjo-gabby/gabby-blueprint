/**
 * ----------------------------------------------
 * 通知(notification)機能 型定義
 * ----------------------------------------------
 * お知らせ(NoticeItem, notice.ts)とは異なり、システムが自動発火する個人宛イベント通知
 * （学習進捗の達成・チャット新着等）を表す。表示テキストは通知種別ごとにpayloadから
 * 組み立てる（お知らせのようにDB上に完成済みのtitle/contentを持たない）ため、
 * NOTIFICATION_MESSAGE_BUILDERS で種別ごとの組み立て方を一元管理する。
 *
 * 新しい通知種別を追加する場合は、DBスキーマ変更は不要。
 * 1. notification_type を追加(下記 NOTIFICATION_TYPES / NOTIFICATION_MESSAGE_BUILDERS)
 * 2. 発火元(DBトリガー or Server Action)で com_t_notification へ INSERT/UPSERT する処理を追加
 * の2点のみで完結する。
 */

// 通知種別ごとの表示メタ情報(アイコン・バッジ色)。ラベル文言は各アプリの言語に依存するため、
// 日本語UIアプリ(admin/student)はここのデフォルトをそのまま使い、英語UIアプリ(coach)は
// constants/notification.ts で NOTIFICATION_MESSAGE_BUILDERS 相当を英語版に差し替える
// （packages/types/notice.ts の NOTICE_TYPES と apps/coach/constants/notice.ts の関係を踏襲）。
export const NOTIFICATION_TYPES = {
  TRAINING_FIRST: {
    icon: 'Sparkles',
    badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  TRAINING_STREAK: {
    icon: 'Flame',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  CHAT_NEW_MESSAGE: {
    icon: 'MessageCircle',
    badgeClass: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  },
  SESSION_CANCELLED_BY_COACH: {
    icon: 'CalendarX',
    badgeClass: 'bg-rose-50 text-rose-600 border-rose-100',
  },
  SESSION_RESCHEDULE_PROPOSED: {
    icon: 'CalendarClock',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  SESSION_RESCHEDULE_PROPOSED_BY_STUDENT: {
    icon: 'CalendarClock',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  SESSION_CANCELLED_BY_STUDENT: {
    icon: 'CalendarX',
    badgeClass: 'bg-rose-50 text-rose-600 border-rose-100',
  },
  SESSION_BOOKED_BY_STUDENT: {
    icon: 'CalendarCheck',
    badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  SESSION_CANCELLED_BY_ADMIN: {
    icon: 'CalendarX',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  SESSION_UPDATED_BY_ADMIN: {
    icon: 'CalendarClock',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  SESSION_BOOKING_REQUESTED: {
    icon: 'CalendarClock',
    badgeClass: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  },
  SESSION_BOOKING_APPROVED: {
    icon: 'CalendarCheck',
    badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  SESSION_BOOKING_REJECTED: {
    icon: 'CalendarX',
    badgeClass: 'bg-rose-50 text-rose-600 border-rose-100',
  },
  MATCHING_APPROVED: {
    icon: 'UserCheck',
    badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  MATCHING_REJECTED: {
    icon: 'CalendarClock',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  MATCHING_ASSIGNED_TO_COACH: {
    icon: 'Users',
    badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  // コーチ宛て。生徒からマッチング申請が届いた（申請の登録時のトリガー）。回答期限は24時間。メールあり
  MATCHING_REQUESTED: {
    icon: 'UserPlus',
    badgeClass: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  },
  // 生徒宛て。マッチング申請がコーチの回答期限（24時間）を過ぎて無効になった（fn_expire_matching_requests）。メールあり
  MATCHING_EXPIRED: {
    icon: 'CalendarX',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  // コーチ宛て。生徒が承認待ちのマッチング申請を取り下げた（withdraw_matching_request）。メールは送らない
  MATCHING_WITHDRAWN: {
    icon: 'UserX',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  HOMEWORK_POSTED: {
    icon: 'ClipboardList',
    badgeClass: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  },
  COACH_REPORT_APPROVED: {
    icon: 'CalendarCheck',
    badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  COACH_REPORT_APPROVAL_REVOKED: {
    icon: 'CalendarX',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  // コーチ宛て。空き時間の見直し（14日ごと）・登録の催促（enqueue_coach_availability_reminders）。メールは送らない
  COACH_AVAILABILITY_REMINDER: {
    icon: 'CalendarClock',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

/**
 * 通知テーブル(com_t_notification)のデータ型
 */
export interface NotificationItem {
  notification_id: string;
  user_id: string;
  notification_type: NotificationType;
  dedup_key: string | null;
  payload: Record<string, unknown>;
  link_path: string | null;
  is_read: boolean;
  read_at: string | null;
  occurred_at: string; // UTC ISO文字列
  insert_date: string;
  update_date: string;
}

export interface NotificationText {
  title: string;
  body: string;
}

/**
 * マッチング成立の通知（payload の booked_sessions / target_sessions）で、未予約の回が残る場合の案内。
 * 他の予定と重なる回は予約されず、生徒とコーチが個別に日時を調整する（2026-10-09より前の通知は回数が無いため空）。
 */
export function getMatchingUnbookedCount(payload: Record<string, unknown>): number {
  const booked = Number(payload.booked_sessions);
  const target = Number(payload.target_sessions);
  if (!Number.isFinite(booked) || !Number.isFinite(target)) return 0;
  return Math.max(target - booked, 0);
}

function matchingUnbookedNoteJa(payload: Record<string, unknown>): string {
  const unbooked = getMatchingUnbookedCount(payload);
  if (unbooked === 0) return '';
  return `${String(payload.target_sessions)}回のうち${String(payload.booked_sessions)}回を予約しました。残り${unbooked}回はライブセッションのページから日時をリクエストしてください。`;
}

/**
 * 通知種別ごとの表示テキスト組み立て関数（デフォルト=日本語）。
 * 英語UIアプリ(coach)は同じ形の辞書を constants/notification.ts で用意し差し替える。
 */
export const NOTIFICATION_MESSAGE_BUILDERS: Record<
  NotificationType,
  (payload: Record<string, unknown>) => NotificationText
> = {
  TRAINING_FIRST: () => ({
    title: 'トレーニングを開始しました',
    body: '最初のトレーニングを記録しました。これまでの歩みはホームで確認できます。',
  }),
  TRAINING_STREAK: (payload) => {
    const days = Number(payload.days ?? 0);
    return {
      title: `${days}日連続のトレーニング`,
      body: `${days}日続けてトレーニングを実施しました。継続の記録はホームで確認できます。`,
    };
  },
  CHAT_NEW_MESSAGE: (payload) => ({
    title: String(payload.sender_name ?? 'メッセージ'),
    body: String(payload.preview ?? '新着メッセージがあります'),
  }),
  SESSION_CANCELLED_BY_COACH: (payload) => ({
    title: 'セッションがキャンセルされました',
    body: `${String(payload.coach_name ?? 'コーチ')}が予定していたセッションをキャンセルしました。`,
  }),
  SESSION_RESCHEDULE_PROPOSED: (payload) => {
    const count = Number(payload.proposal_count ?? 0);
    return {
      title: '振替候補が届いています',
      body: `${String(payload.coach_name ?? 'コーチ')}からキャンセルの振替候補（${count}件）が届いています。ライブセッション画面でご確認ください。`,
    };
  },
  SESSION_RESCHEDULE_PROPOSED_BY_STUDENT: (payload) => {
    const count = Number(payload.proposal_count ?? 0);
    return {
      title: '振替候補の提案が届いています',
      body: `${String(payload.student_name ?? '生徒')}からキャンセルの振替候補（${count}件）が届いています。申請一覧でご確認ください。`,
    };
  },
  SESSION_CANCELLED_BY_STUDENT: (payload) => ({
    title: 'セッションがキャンセルされました',
    body: `${String(payload.student_name ?? '生徒')}が予定していたセッションをキャンセルしました。`,
  }),
  SESSION_BOOKED_BY_STUDENT: (payload) => ({
    title: '新しいセッションが予約されました',
    body: `${String(payload.student_name ?? '生徒')}がセッションを予約/振替しました。`,
  }),
  SESSION_CANCELLED_BY_ADMIN: () => ({
    title: 'セッションがキャンセルされました',
    body: '予定されていたセッションがキャンセルされました。詳しくはカレンダーをご確認ください。',
  }),
  SESSION_UPDATED_BY_ADMIN: () => ({
    title: 'セッションが更新されました',
    body: '管理者により予定が更新されました。詳しくはカレンダーをご確認ください。',
  }),
  SESSION_BOOKING_REQUESTED: (payload) => ({
    title: '予約リクエストが届いています',
    body: `${String(payload.student_name ?? '生徒')}からセッションの予約リクエストが届いています。申請一覧でご確認ください。`,
  }),
  SESSION_BOOKING_APPROVED: (payload) => ({
    title: '予約が承認されました',
    body: `${String(payload.coach_name ?? 'コーチ')}がセッションの予約を承認しました。`,
  }),
  SESSION_BOOKING_REJECTED: (payload) => ({
    title: '予約リクエストについて',
    body: `${String(payload.coach_name ?? 'コーチ')}は今回のリクエストを受け付けられませんでした。他の日時でお試しください。`,
  }),
  MATCHING_APPROVED: (payload) => ({
    title: 'マッチングが成立しました！',
    body: `${String(payload.coach_name ?? 'コーチ')}とのライブセッションが予約されました。${matchingUnbookedNoteJa(payload)}`,
  }),
  MATCHING_REJECTED: (payload) => ({
    title: 'マッチングについて',
    body: `${String(payload.coach_name ?? 'コーチ')}は今回ご希望の枠を受け付けられませんでした。他の時間帯やコーチもぜひお試しください。`,
  }),
  MATCHING_ASSIGNED_TO_COACH: (payload) => ({
    title: '新しい生徒とマッチングしました',
    body: `${String(payload.student_name ?? '生徒')}さんとのライブセッションが予約されました。`,
  }),
  MATCHING_REQUESTED: (payload) => ({
    title: 'マッチングのリクエストが届いています',
    body: `${String(payload.student_name ?? '生徒')}さんから専属コーチのマッチングのリクエストが届いています。24時間以内に承認または否認してください。`,
  }),
  MATCHING_EXPIRED: (payload) => ({
    title: 'マッチングのリクエストが無効になりました',
    body: `${String(payload.coach_name ?? 'コーチ')}への専属コーチのリクエストは、回答期限（24時間）までにコーチの回答が無かったため無効になりました。別のコーチや時間帯でリクエストしてください。`,
  }),
  MATCHING_WITHDRAWN: (payload) => ({
    title: 'マッチングのリクエストが取り下げられました',
    body: `${String(payload.student_name ?? '生徒')}さんがマッチングのリクエストを取り下げました。`,
  }),
  HOMEWORK_POSTED: (payload) => ({
    title: `${String(payload.coach_name ?? 'コーチ')}から宿題が届いています`,
    body: String(payload.preview ?? '宿題の内容をご確認ください'),
  }),
  COACH_REPORT_APPROVED: (payload) => ({
    title: '月次コーチングレポートが承認されました',
    body: `${formatReportMonthJa(payload.report_month)}分のレポートが承認されました。`,
  }),
  COACH_REPORT_APPROVAL_REVOKED: (payload) => ({
    title: '月次コーチングレポートの承認が取り消されました',
    body: `${formatReportMonthJa(payload.report_month)}分のレポートの承認が取り消されました。`,
  }),
  COACH_AVAILABILITY_REMINDER: (payload) =>
    payload.kind === 'empty'
      ? {
          title: '対応可能時間を登録してください',
          body: '対応可能時間が登録されていないため、生徒からマッチングの申請を受けられません。',
        }
      : {
          title: '対応可能時間を確認してください',
          body: '最後の確認から2週間が経ちました。夏時間の切り替え等で表示がずれていないか確認してください。',
        },
};

/** payload.report_month ("YYYY-MM-DD"等) を "YYYY年M月" 表記へ変換する（通知本文用） */
function formatReportMonthJa(reportMonth: unknown): string {
  const s = String(reportMonth ?? '');
  const match = /^(\d{4})-(\d{2})/.exec(s);
  if (!match) return s;
  return `${match[1]}年${Number(match[2])}月`;
}
