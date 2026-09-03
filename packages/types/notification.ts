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
 * 通知種別ごとの表示テキスト組み立て関数（デフォルト=日本語）。
 * 英語UIアプリ(coach)は同じ形の辞書を constants/notification.ts で用意し差し替える。
 */
export const NOTIFICATION_MESSAGE_BUILDERS: Record<
  NotificationType,
  (payload: Record<string, unknown>) => NotificationText
> = {
  TRAINING_FIRST: () => ({
    title: '学習スタート！',
    body: '初めてのトレーニングを実施しました。この調子で続けましょう。',
  }),
  TRAINING_STREAK: (payload) => {
    const days = Number(payload.days ?? 0);
    return {
      title: `連続${days}日達成！`,
      body: `${days}日連続でトレーニングを実施しました。素晴らしいペースです。`,
    };
  },
  CHAT_NEW_MESSAGE: (payload) => ({
    title: String(payload.sender_name ?? 'メッセージ'),
    body: String(payload.preview ?? '新着メッセージがあります'),
  }),
};
