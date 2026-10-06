import 'server-only';
import type { NotificationType } from '@gabby/types/notification';
import { getNotificationText } from '@gabby/types/notificationText';
import { renderMail } from '../../render';
import { buildChatUnreadMail, buildNotificationMail } from '../../templates/NotificationEmailTemplate';
import { NOTIFICATION_MAIL_TYPES } from '../registry';
import type { MailHandler } from '../types';
import { readText } from './payload';

function isMailTarget(type: string): type is NotificationType {
  return (NOTIFICATION_MAIL_TYPES as readonly string[]).includes(type);
}

/**
 * 出来事の通知メール（NOTIFICATION・CHAT_UNREAD。登録: アプリ内通知のトリガー enqueue_notification_mail）。
 * 送る直前にアプリ内通知を読み直し、文面はアプリ内通知と同じタイトル・本文にする（生徒は日本語、コーチは英語）。
 * チャットの新着（CHAT_UNREAD）は、送る時点で既読になっていれば送らない。
 */
export const notificationHandler: MailHandler = async ({ admin, row, recipient, links }) => {
  const notificationId = readText(row.payload, 'notification_id');
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

  if (row.mail_type === 'CHAT_UNREAD') {
    if (notification.is_read) return { skip: 'already_read' };
    return renderMail(
      buildChatUnreadMail({
        language,
        recipientName: recipient.userName,
        senderName: readText(payload, 'sender_name'),
        preview: readText(payload, 'preview'),
        actionUrl,
        links,
      })
    );
  }

  const text = getNotificationText(notification.notification_type, payload, language);
  return renderMail(
    buildNotificationMail({
      language,
      recipientName: recipient.userName,
      title: text.title,
      body: text.body,
      actionUrl,
      links,
    })
  );
};
