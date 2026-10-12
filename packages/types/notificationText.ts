import { NOTIFICATION_MESSAGE_BUILDERS, NOTIFICATION_TYPES, type NotificationText, type NotificationType } from './notification';
import { NOTIFICATION_MESSAGE_BUILDERS_EN } from './notificationEn';

/**
 * 通知の表示テキスト（アプリ内の通知センター・通知一覧・通知メールで共通）。
 * 言語は 生徒・アドミン: ja / コーチ: en。
 * 知らない種別（DB に先に追加された新しい種別等）は、画面を壊さないよう汎用の文言にする。
 */

export type NotificationLocale = 'ja' | 'en';

const FALLBACK_TEXT: Record<NotificationLocale, NotificationText> = {
  ja: { title: 'お知らせ', body: '新しい通知があります。' },
  en: { title: 'Notification', body: 'You have a new notification.' },
};

export function isNotificationType(type: string): type is NotificationType {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, type);
}

export function getNotificationText(type: string, payload: Record<string, unknown> | null | undefined, locale: NotificationLocale): NotificationText {
  if (!isNotificationType(type)) return FALLBACK_TEXT[locale];
  const builders = locale === 'en' ? NOTIFICATION_MESSAGE_BUILDERS_EN : NOTIFICATION_MESSAGE_BUILDERS;
  return builders[type](payload ?? {});
}
