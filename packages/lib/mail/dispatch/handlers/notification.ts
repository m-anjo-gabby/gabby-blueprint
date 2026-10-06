import 'server-only';
import { NOTIFICATION_MESSAGE_BUILDERS, type NotificationType } from '@gabby/types/notification';
import { NOTIFICATION_MESSAGE_BUILDERS_EN } from '@gabby/types/notificationEn';
import { renderNotificationEmail } from '../../render';
import { NOTIFICATION_MAIL_TYPES } from '../registry';
import type { MailHandler } from '../types';

function isMailTarget(type: string): type is NotificationType {
  return (NOTIFICATION_MAIL_TYPES as readonly string[]).includes(type);
}

/**
 * 出来事の通知メール（NOTIFICATION・CHAT_UNREAD。登録: アプリ内通知のトリガー enqueue_notification_mail）。
 * 送る直前にアプリ内通知を読み直し、文面はアプリ内通知と同じタイトル・本文にする（生徒は日本語、コーチは英語）。
 * チャットの新着（CHAT_UNREAD）は、送る時点で既読になっていれば送らない。
 */
export const notificationHandler: MailHandler = async ({ admin, row, recipient, links }) => {
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

  const { language } = recipient;
  const payload = (notification.payload ?? {}) as Record<string, unknown>;
  const actionUrl = notification.link_path ? links.portal(notification.link_path) : null;
  const { settingsUrl, unsubscribeUrl } = links;

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
      unsubscribeUrl,
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
    unsubscribeUrl,
  });
};
