import 'server-only';
import { USER_TYPES } from '@gabby/types/user';
import { SESSION_STATUS } from '@gabby/types/session';
import { getPortalBaseUrl } from '../../../navigation/portalUrl';
import { formatReminderSchedule, renderLiveSessionReminderEmail } from '../../render';
import type { ReminderLead } from '../../templates/EventReminderEmailTemplate';
import type { MailHandler } from '../types';

function toPortalUrl(base: string, path: string): string | null {
  return base ? `${base.replace(/\/+$/, '')}${path}` : null;
}

/**
 * ライブセッションのリマインダー（LIVE_SESSION_REMINDER、登録: enqueue_live_session_reminders）。
 * 送る直前にセッションを読み直し、予定（status=1）でない（キャンセル・振替・実施済み）・開始済み・宛先がそのセッションの生徒/コーチでない場合は送らない。
 * 生徒には日本語（相手はコーチ）、コーチには英語（相手は生徒）。
 * 主ボタンは、生徒はライブセッション画面（1時間前も。通話画面は開始5分前まで入れず、メールからすぐ開くとエラーになるため。
 * ライブセッション画面の入室ボタンは、早い場合に入室できる時刻を案内する）、コーチはセッションハブ。
 */
export const liveSessionReminderHandler: MailHandler = async ({ admin, row, recipient, nowMs, unsubscribeUrl }) => {
  const sessionId = typeof row.payload.session_id === 'string' ? row.payload.session_id : null;
  const lead: ReminderLead = row.payload.lead === '1h' ? '1h' : '24h';
  if (!sessionId) return { skip: 'invalid_payload' };

  const { data: session, error } = await admin
    .from('com_t_session')
    .select('student_id, coach_id, start_datetime, end_datetime, status')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw new Error(`session_fetch_failed: ${error.message}`);
  if (!session || session.status !== SESSION_STATUS.SCHEDULED) return { skip: 'session_unavailable' };
  if (new Date(session.start_datetime).getTime() <= nowMs) return { skip: 'session_started' };

  const isStudent = recipient.userType === USER_TYPES.STUDENT && session.student_id === recipient.userId;
  const isCoach = recipient.userType === USER_TYPES.COACH && session.coach_id === recipient.userId;
  if (!isStudent && !isCoach) return { skip: 'not_participating' };

  const counterpartId = isStudent ? session.coach_id : session.student_id;
  const { data: counterpart } = await admin.from('com_m_user').select('user_name').eq('id', counterpartId).maybeSingle();

  const language = isStudent ? 'ja' : 'en';
  const portal = getPortalBaseUrl(recipient.userType);
  const coachHubPath = `/students/${session.student_id}/sessions/${sessionId}`;
  const actionPath = isStudent ? '/live-room' : coachHubPath;

  return renderLiveSessionReminderEmail({
    language,
    lead,
    recipientName: recipient.userName,
    counterpartName: counterpart?.user_name ?? null,
    scheduleLabel: formatReminderSchedule({
      startIso: session.start_datetime,
      endIso: session.end_datetime,
      timeZone: recipient.timezone,
      language,
    }),
    actionUrl: toPortalUrl(portal, actionPath),
    settingsUrl: toPortalUrl(portal, '/profile'),
    unsubscribeUrl,
  });
};
