import 'server-only';
import { USER_TYPES } from '@gabby/types/user';
import { renderMail } from '../../render';
import { buildEventReminderMail } from '../../templates/EventReminderEmailTemplate';
import { formatReminderSchedule, toReminderLead } from '../../templates/reminder';
import type { MailHandler } from '../types';
import { readText } from './payload';

/** 結合したシリーズ（1件。型の推論上は配列になりうる）のタイトル */
function pickSeriesTitle(series: unknown): string | null {
  const row = Array.isArray(series) ? series[0] : series;
  return row && typeof row === 'object' && 'title' in row && typeof row.title === 'string' ? row.title : null;
}

/**
 * グループセッションのリマインダー（GROUP_SESSION_REMINDER、登録: enqueue_event_reminders）。
 * 送る直前にイベントと参加状況を読み直し、取消・非公開・開始済み・参加取消（担当も外れた）の場合は送らない。
 * 日時の変更があっても最新の日時で送る。生徒には日本語、コーチには英語で送る。
 */
export const groupSessionReminderHandler: MailHandler = async ({ admin, row, recipient, nowMs, links }) => {
  const calendarEventId = readText(row.payload, 'calendar_event_id');
  if (!calendarEventId) return { skip: 'invalid_payload' };

  const { data: event, error } = await admin
    .from('com_m_calendar_event')
    .select('title, description, start_datetime, end_datetime, location_url, is_published, delete_flg, series:com_m_calendar_event_series(title)')
    .eq('calendar_event_id', calendarEventId)
    .maybeSingle();
  if (error) throw new Error(`event_fetch_failed: ${error.message}`);
  if (!event || !event.is_published || event.delete_flg !== '0') return { skip: 'event_unavailable' };
  if (new Date(event.start_datetime).getTime() <= nowMs) return { skip: 'event_started' };

  const [{ count: participantCount, error: pErr }, { count: coachCount, error: cErr }] = await Promise.all([
    admin
      .from('com_t_calendar_event_participant')
      .select('user_id', { count: 'exact', head: true })
      .eq('calendar_event_id', calendarEventId)
      .eq('user_id', recipient.userId),
    admin
      .from('com_t_calendar_event_coach')
      .select('coach_id', { count: 'exact', head: true })
      .eq('calendar_event_id', calendarEventId)
      .eq('coach_id', recipient.userId),
  ]);
  if (pErr || cErr) throw new Error(`participation_fetch_failed: ${(pErr ?? cErr)?.message}`);
  if (!participantCount && !coachCount) return { skip: 'not_participating' };

  const isCoach = recipient.userType === USER_TYPES.COACH;
  const { language } = recipient;

  return renderMail(
    buildEventReminderMail({
      language,
      lead: toReminderLead(row.payload.lead),
      recipientName: recipient.userName,
      title: event.title,
      seriesTitle: pickSeriesTitle(event.series),
      description: event.description,
      scheduleLabel: formatReminderSchedule({
        startIso: event.start_datetime,
        endIso: event.end_datetime,
        timeZone: recipient.timezone,
        language,
      }),
      joinUrl: event.location_url,
      // 生徒はグループセッションの一覧、コーチはカレンダーで詳細を確認する
      detailUrl: links.portal(isCoach ? '/calendar' : '/group-sessions'),
      links,
    })
  );
};
