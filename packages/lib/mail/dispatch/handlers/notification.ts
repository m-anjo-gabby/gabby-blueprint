import 'server-only';
import { USER_TYPES } from '@gabby/types/user';
import { NOTIFICATION_MESSAGE_BUILDERS, type NotificationType } from '@gabby/types/notification';
import { NOTIFICATION_MESSAGE_BUILDERS_EN } from '@gabby/types/notificationEn';
import { getPortalBaseUrl } from '../../../navigation/portalUrl';
import { renderNotificationEmail } from '../../render';
import type { NotificationMailLanguage } from '../../templates/NotificationEmailTemplate';
import { NOTIFICATION_MAIL_TYPES } from '../registry';
import type { MailHandler, MailRecipient } from '../types';

function toPortalUrl(recipient: MailRecipient, path: string | null): string | null {
  const base = getPortalBaseUrl(recipient.userType);
  if (!base || !path) return null;
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/** 宛先の言語（生徒: 日本語 / コーチ: 英語）。それ以外（管理者）は送らない */
function resolveLanguage(recipient: MailRecipient): NotificationMailLanguage | null {
  if (recipient.userType === USER_TYPES.STUDENT) return 'ja';
  if (recipient.userType === USER_TYPES.COACH) return 'en';
  return null;
}

function isMailTarget(type: string): type is NotificationType {
  return (NOTIFICATION_MAIL_TYPES as readonly string[]).includes(type);
}

/**
 * 出来事の通知メール（NOTIFICATION・CHAT_UNREAD。登録: アプリ内通知のトリガー enqueue_notification_mail）。
 * 送る直前にアプリ内通知を読み直し、文面はアプリ内通知と同じタイトル・本文にする（生徒は日本語、コーチは英語）。
 * チャットの新着（CHAT_UNREAD）は、送る時点で既読になっていれば送らない。
 */
export const notificationHandler: MailHandler = async ({ admin, row, recipient }) => {
  const notificationId = typeof row.payload.notification_id === 'string' ? row.payload.notification_id : null;
  if (!notificationId) return { skip: 'invalid_payload' };

  const { data: notification, error } = await admin
    .from('com_t_notification')
    .select('notification_type, payload, link_path, is_read')
    .eq('notification_id', notificationId)
    .maybeSingle();
  if (error) throw new Error(`notification_fetch_failed: ${error.message}`);
  if (!notification) return { skip: 'notification_unavailable' };
  if (!isMailTarget(notification.notification_type)) return { skip: 'not_mail_target' };

  const language = resolveLanguage(recipient);
  if (!language) return { skip: 'unsupported_recipient' };

  const payload = (notification.payload ?? {}) as Record<string, unknown>;
  const actionUrl = toPortalUrl(recipient, notification.link_path);
  const settingsUrl = toPortalUrl(recipient, '/profile');

  if (row.mail_type === 'CHAT_UNREAD') {
    if (notification.is_read) return { skip: 'already_read' };
    const sender = typeof payload.sender_name === 'string' && payload.sender_name ? payload.sender_name : null;
    const preview = typeof payload.preview === 'string' && payload.preview ? payload.preview : null;
    return renderNotificationEmail({
      language,
      recipientName: recipient.userName,
      title:
        language === 'ja'
          ? `${sender ? `${sender}さんから` : ''}新しいメッセージが届いています`
          : `New message${sender ? ` from ${sender}` : ''}`,
      body: preview ?? (language === 'ja' ? 'チャットを開いてご確認ください。' : 'Open the chat to read it.'),
      quoted: !!preview,
      actionUrl,
      settingsUrl,
    });
  }

  const builders = language === 'ja' ? NOTIFICATION_MESSAGE_BUILDERS : NOTIFICATION_MESSAGE_BUILDERS_EN;
  const text = builders[notification.notification_type](payload);
  return renderNotificationEmail({
    language,
    recipientName: recipient.userName,
    title: text.title,
    body: text.body,
    actionUrl,
    settingsUrl,
  });
};
