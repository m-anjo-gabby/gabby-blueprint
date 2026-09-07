import { NotificationType, NotificationText } from '@gabby/types/notification';

/**
 * English notification message builders for the Coach portal.
 * Structural metadata (icon/badgeClass) still comes from the shared NOTIFICATION_TYPES;
 * only the display text is overridden here (same pattern as constants/notice.ts).
 * Coach notifications are currently CHAT_NEW_MESSAGE only, but all types are covered
 * for type-safety and to be ready if other notification types ever surface to coaches.
 */
export const NOTIFICATION_MESSAGE_BUILDERS_EN: Record<
  NotificationType,
  (payload: Record<string, unknown>) => NotificationText
> = {
  TRAINING_FIRST: () => ({
    title: 'Training started!',
    body: 'Completed the first training session.',
  }),
  TRAINING_STREAK: (payload) => {
    const days = Number(payload.days ?? 0);
    return {
      title: `${days}-day streak!`,
      body: `Trained for ${days} days in a row. Great pace!`,
    };
  },
  CHAT_NEW_MESSAGE: (payload) => ({
    title: String(payload.sender_name ?? 'New message'),
    body: String(payload.preview ?? 'You have a new message'),
  }),
};
