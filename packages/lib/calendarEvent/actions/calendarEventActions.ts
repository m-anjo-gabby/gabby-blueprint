'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { CalendarEventItem } from '@gabby/types/calendarEvent';

const logger = createLogger('common');

/**
 * ログイン中ユーザー（生徒/コーチいずれか）向けに公開中のカレンダーイベント一覧を、
 * 指定期間内で取得する（ポータル共通）。
 * RLS（is_published=TRUE AND delete_flg='0' かつ target_type/user_typeに応じた絞り込み）
 * に依存するため、呼び出し側でロールを意識する必要はない。
 */
export async function getPublishedCalendarEventsCore(
  startIso: string,
  endIso: string
): Promise<{ success: true; events: CalendarEventItem[] } | { success: false; errorCode: 'unauthorized' | 'unexpected_error' }> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    // participant はRLS（user_id = auth.uid()）により本人の参加行のみ結合される（com_t_notice_readの既読結合と同じ考え方）
    const { data, error } = await supabase
      .from('com_m_calendar_event')
      .select('*, participant:com_t_calendar_event_participant(calendar_event_id)')
      .gte('start_datetime', startIso)
      .lt('start_datetime', endIso)
      .order('start_datetime', { ascending: true });

    if (error) {
      logger.error('calendarEvent:get_published_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const events: CalendarEventItem[] = (data ?? []).map((row: any) => ({
      ...row,
      is_joined: Array.isArray(row.participant) && row.participant.length > 0,
    }));

    return { success: true, events };
  } catch (err) {
    logger.error('calendarEvent:get_published_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * カレンダーイベントへの参加登録（生徒/コーチ共通。ポータル共通）
 */
export async function joinCalendarEventCore(
  calendarEventId: string
): Promise<{ success: true } | { success: false; errorCode: 'unauthorized' | 'unexpected_error' }> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase
      .from('com_t_calendar_event_participant')
      .upsert({ user_id: user.id, calendar_event_id: calendarEventId }, { onConflict: 'user_id,calendar_event_id' });

    if (error) {
      logger.error('calendarEvent:join_failed', error.message, { ...ctx, userId: user.id, payload: { calendarEventId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    logger.info('calendarEvent:join_success', 'Joined calendar event', { ...ctx, userId: user.id, payload: { calendarEventId } });
    return { success: true };
  } catch (err) {
    logger.error('calendarEvent:join_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * カレンダーイベントの参加キャンセル（生徒/コーチ共通。ポータル共通）
 */
export async function cancelCalendarEventParticipationCore(
  calendarEventId: string
): Promise<{ success: true } | { success: false; errorCode: 'unauthorized' | 'unexpected_error' }> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase
      .from('com_t_calendar_event_participant')
      .delete()
      .eq('user_id', user.id)
      .eq('calendar_event_id', calendarEventId);

    if (error) {
      logger.error('calendarEvent:cancel_participation_failed', error.message, { ...ctx, userId: user.id, payload: { calendarEventId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    logger.info('calendarEvent:cancel_participation_success', 'Cancelled calendar event participation', {
      ...ctx,
      userId: user.id,
      payload: { calendarEventId },
    });
    return { success: true };
  } catch (err) {
    logger.error('calendarEvent:cancel_participation_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
