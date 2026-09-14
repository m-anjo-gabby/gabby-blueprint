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
  SESSION_CANCELLED_BY_ADMIN: () => ({
    title: 'Session cancelled',
    body: 'A scheduled session was cancelled. Check your calendar for details.',
  }),
  MATCHING_APPROVED: (payload) => ({
    // 実際にはstudent_id宛にのみ送られる通知のため、コーチが受け取ることは想定していない
    // （Record<NotificationType, ...>を満たすための型安全用エントリ）。
    title: "You're matched!",
    body: `Live sessions with ${String(payload.coach_name ?? 'your coach')} are now scheduled.`,
  }),
  MATCHING_REJECTED: () => ({
    // 実際にはstudent_id宛にのみ送られる通知のため、コーチが受け取ることは想定していない
    // （Record<NotificationType, ...>を満たすための型安全用エントリ）。
    title: 'About your request',
    body: 'This request was not accepted this time.',
  }),
  MATCHING_ASSIGNED_TO_COACH: (payload) => ({
    title: "You've been matched with a new student",
    body: `Live sessions with ${String(payload.student_name ?? 'a student')} are now scheduled.`,
  }),
};
