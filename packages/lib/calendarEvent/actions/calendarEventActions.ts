'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { CalendarEventItem, CalendarEventMessageItem } from '@gabby/types/calendarEvent';

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

    // participant/assigned_coach はいずれもRLS（user_id/coach_id = auth.uid()）により
    // 本人の行のみ結合される（com_t_notice_readの既読結合と同じ考え方）。
    // assigned_coach はコーチが担当コーチとして割り当てられている場合のみ行が返る
    // （生徒には該当行が無いため常に空配列になる）。
    const { data, error } = await supabase
      .from('com_m_calendar_event')
      .select(
        '*, participant:com_t_calendar_event_participant(calendar_event_id), assigned_coach:com_t_calendar_event_coach(calendar_event_id)'
      )
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
      is_assigned_coach: Array.isArray(row.assigned_coach) && row.assigned_coach.length > 0,
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

/**
 * 指定カレンダーイベントのアナウンス一覧を取得する（生徒/コーチ共通。ポータル共通）
 * RLS（参加者本人 or 担当コーチのみ閲覧可）に依存するため、対象外のイベントIDを
 * 指定した場合は空配列が返る。
 */
export async function getCalendarEventMessagesCore(
  calendarEventId: string
): Promise<{ success: true; messages: CalendarEventMessageItem[] } | { success: false; errorCode: 'unauthorized' | 'unexpected_error' }> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_calendar_event_message')
      .select('*')
      .eq('calendar_event_id', calendarEventId)
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error('calendarEvent:get_messages_failed', error.message, { ...ctx, userId: user.id, payload: { calendarEventId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const messages: CalendarEventMessageItem[] = (data ?? []).map((row: any) => ({
      ...row,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
    }));

    return { success: true, messages };
  } catch (err) {
    logger.error('calendarEvent:get_messages_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * アナウンス添付ファイルの公開URLを取得する（"calendar-event-message" はPublicバケット）
 */
export async function getCalendarEventMessageAttachmentUrlCore(path: string): Promise<{ url: string | null }> {
  const supabase = await createServerClient();
  const { data } = supabase.storage.from('calendar-event-message').getPublicUrl(path);
  return { url: data?.publicUrl ?? null };
}
