'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { CalendarEventItem, CalendarEventType, CalendarEventTargetType } from '@gabby/types/calendarEvent';

const logger = createLogger('admin');

export interface CalendarEventFormData {
  calendar_event_id?: string;
  event_type: CalendarEventType;
  title: string;
  description?: string | null;
  start_date: string; // JST "YYYY-MM-DD"
  start_time: string; // JST "HH:MM"
  end_date?: string | null; // JST "YYYY-MM-DD"（任意）
  end_time?: string | null; // JST "HH:MM"（任意）
  location_url?: string | null;
  target_type: CalendarEventTargetType;
  client_id?: string | null;
  is_published: boolean;
}

/**
 * JSTの日付("YYYY-MM-DD")+時刻("HH:MM")文字列をUTCのISO文字列に変換する
 */
function jstDateTimeToUtcIso(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00+09:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * カレンダーイベント一覧取得
 */
export async function getCalendarEvents(): Promise<CalendarEventItem[]> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_calendar_event')
      .select('*')
      .eq('delete_flg', '0')
      .order('start_datetime', { ascending: false });

    if (error) {
      logger.error('calendarEvent:get_calendar_events_failed', error.message, ctx);
      throw new Error(error.message);
    }
    return data as CalendarEventItem[];
  } catch (error) {
    logger.error('calendarEvent:get_calendar_events_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * カレンダーイベントの新規作成/更新
 * calendar_event_idの有無で insert / update を明示的に分岐する
 * （timezoneのような人間可読な自然キーを持たないため upsert() は使わない）
 */
export async function upsertCalendarEvent(
  formData: CalendarEventFormData
): Promise<{ success: true; data: CalendarEventItem } | { success: false; message: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const startUtc = jstDateTimeToUtcIso(formData.start_date, formData.start_time);
    if (!startUtc) {
      return { success: false, message: '開始日時が不正です' };
    }
    const endUtc = formData.end_date && formData.end_time ? jstDateTimeToUtcIso(formData.end_date, formData.end_time) : null;

    const row = {
      event_type: formData.event_type,
      title: formData.title,
      description: formData.description || null,
      start_datetime: startUtc,
      end_datetime: endUtc,
      location_url: formData.location_url || null,
      target_type: formData.target_type,
      client_id: formData.target_type === 'CLIENT' ? formData.client_id || null : null,
      is_published: formData.is_published,
      update_date: new Date().toISOString(),
    };

    const query = formData.calendar_event_id
      ? supabase.from('com_m_calendar_event').update(row).eq('calendar_event_id', formData.calendar_event_id)
      : supabase.from('com_m_calendar_event').insert(row);

    const { data, error } = await query.select().single();

    if (error) {
      logger.error('calendarEvent:upsert_calendar_event_failed', error.message, { ...ctx, payload: formData });
      return { success: false, message: error.message };
    }

    const saved = data as CalendarEventItem;
    logger.info('calendarEvent:upsert_calendar_event_success', `Calendar event upserted: ${saved.calendar_event_id}`, {
      ...ctx,
      payload: { calendar_event_id: saved.calendar_event_id },
    });

    revalidatePath('/calendar-events');
    return { success: true, data: saved };
  } catch (error) {
    logger.error('calendarEvent:upsert_calendar_event_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      payload: formData,
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * カレンダーイベントの論理削除
 */
export async function deleteCalendarEvent(calendarEventId: string): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('com_m_calendar_event')
      .update({ delete_flg: '1', update_date: new Date().toISOString() })
      .eq('calendar_event_id', calendarEventId);

    if (error) {
      logger.error('calendarEvent:delete_calendar_event_failed', error.message, { ...ctx, payload: { calendarEventId } });
      return { success: false, message: error.message };
    }

    logger.info('calendarEvent:delete_calendar_event_success', 'Calendar event logically deleted', { ...ctx, payload: { calendarEventId } });

    revalidatePath('/calendar-events');
    return { success: true };
  } catch (error) {
    logger.error('calendarEvent:delete_calendar_event_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      payload: { calendarEventId },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}
