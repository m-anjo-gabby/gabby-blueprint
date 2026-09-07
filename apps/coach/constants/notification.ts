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
  SESSION_CANCELLED_BY_COACH: () => ({
    title: 'Session cancelled',
    body: 'You cancelled a scheduled session.',
  }),
  SESSION_RESCHEDULE_PROPOSED: () => ({
    title: 'Reschedule proposal sent',
    body: 'Your proposed reschedule times were sent to the student.',
  }),
  SESSION_CANCELLED_BY_STUDENT: (payload) => ({
    title: 'Session cancelled',
    body: `${String(payload.student_name ?? 'A student')} cancelled a scheduled session.`,
  }),
  SESSION_BOOKED_BY_STUDENT: (payload) => ({
    title: 'New session booked',
    body: `${String(payload.student_name ?? 'A student')} booked or rescheduled a session.`,
  }),
};
