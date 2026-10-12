import { Flame, MessageCircle, Sparkles, type LucideIcon } from 'lucide-react';
import { NOTIFICATION_TYPES, type NotificationItem } from '@gabby/types/notification';
import { getNotificationText, isNotificationType, type NotificationLocale } from '@gabby/types/notificationText';

/**
 * 通知1件の表示内容（アイコン・バッジ色・タイトル・本文）。通知センター・通知一覧（admin/coach/student）で共通。
 * 文言の言語は 生徒・アドミン: ja / コーチ: en。
 * icon・badgeClass が null の場合は、各画面の既定（ベルのアイコン・グレーの下地）で表示する。
 */
export interface NotificationDisplay {
  icon: LucideIcon | null;
  badgeClass: string | null;
  title: string;
  body: string;
}

/** アイコンを表示する種別（NOTIFICATION_TYPES の icon の名前 → 部品）。ここに無いアイコン名は既定のアイコンで表示する */
const ICONS: Record<string, LucideIcon> = { Sparkles, Flame, MessageCircle };

export function getNotificationDisplay(
  notification: Pick<NotificationItem, 'notification_type' | 'payload'>,
  locale: NotificationLocale
): NotificationDisplay {
  const type = notification.notification_type;
  const meta = isNotificationType(type) ? NOTIFICATION_TYPES[type] : null;
  return {
    icon: meta ? (ICONS[meta.icon] ?? null) : null,
    badgeClass: meta?.badgeClass ?? null,
    ...getNotificationText(type, notification.payload, locale),
  };
}
