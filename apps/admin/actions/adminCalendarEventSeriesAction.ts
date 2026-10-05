'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  CALENDAR_EVENT_TYPES,
  CalendarEventItem,
  CalendarEventSeriesItem,
  CalendarEventSeriesSummary,
  CalendarEventTargetType,
} from '@gabby/types/calendarEvent';
import { getCalendarEvents } from './adminCalendarEventAction';

const logger = createLogger('admin');

const SERIES_PATH = '/calendar-events/series';

export interface CalendarEventSeriesFormData {
  series_id?: string;
  title: string;
  description?: string | null;
}

/** 「回をまとめて追加」の1行（日時は JST の入力値） */
export interface SeriesSessionRow {
  date: string; // JST "YYYY-MM-DD"
  start_time: string; // JST "HH:MM"
  end_time?: string | null; // JST "HH:MM"（任意。開始より前なら翌日とみなす）
  title: string;
  description?: string | null;
  coach_ids: string[];
}

/** 「回をまとめて追加」で全回に共通する設定 */
export interface SeriesSessionCommon {
  location_url?: string | null;
  target_type: CalendarEventTargetType;
  client_id?: string | null;
  is_published: boolean;
}

function jstDateTimeToUtcIso(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00+09:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * シリーズの一覧（回の数・これからの直近の回の開始日時つき。新しく作ったものから）
 */
export async function getCalendarEventSeriesList(): Promise<CalendarEventSeriesItem[]> {
  const ctx = await getLogContext();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('com_m_calendar_event_series')
    .select('series_id, event_type, title, description, insert_date, update_date, sessions:com_m_calendar_event(start_datetime, delete_flg)')
    .eq('delete_flg', '0')
    .order('insert_date', { ascending: false });

  if (error) {
    logger.error('calendarEventSeries:get_list_failed', error.message, ctx);
    throw new Error(error.message);
  }

  const nowIso = new Date().toISOString();
  return (data ?? []).map(({ sessions, ...series }) => {
    const active = (sessions ?? []).filter((s) => s.delete_flg === '0');
    const upcoming = active.map((s) => s.start_datetime).filter((start) => start >= nowIso).sort();
    return {
      ...series,
      session_count: active.length,
      next_start_datetime: upcoming[0] ?? null,
    } as CalendarEventSeriesItem;
  });
}

/** シリーズの選択肢（イベントの登録・編集用。軽量） */
export async function getCalendarEventSeriesOptions(): Promise<CalendarEventSeriesSummary[]> {
  const ctx = await getLogContext();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('com_m_calendar_event_series')
    .select('series_id, title, description')
    .eq('delete_flg', '0')
    .order('insert_date', { ascending: false });
  if (error) {
    logger.error('calendarEventSeries:get_options_failed', error.message, ctx);
    return [];
  }
  return data ?? [];
}

/**
 * シリーズの詳細（シリーズと、属する回を開始日時の順に）
 */
export async function getCalendarEventSeries(
  seriesId: string
): Promise<{ series: CalendarEventSeriesSummary | null; sessions: CalendarEventItem[] }> {
  const ctx = await getLogContext();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('com_m_calendar_event_series')
    .select('series_id, title, description')
    .eq('series_id', seriesId)
    .eq('delete_flg', '0')
    .maybeSingle();
  if (error) {
    logger.error('calendarEventSeries:get_failed', error.message, { ...ctx, payload: { seriesId } });
    throw new Error(error.message);
  }
  if (!data) return { series: null, sessions: [] };

  const sessions = (await getCalendarEvents({ seriesId })).sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
  return { series: data, sessions };
}

/** シリーズの新規作成・更新 */
export async function upsertCalendarEventSeries(
  formData: CalendarEventSeriesFormData
): Promise<{ success: true; seriesId: string } | { success: false; message: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const row = {
      title: formData.title.trim(),
      description: formData.description?.trim() || null,
      update_date: new Date().toISOString(),
    };
    const query = formData.series_id
      ? supabase.from('com_m_calendar_event_series').update(row).eq('series_id', formData.series_id)
      : supabase.from('com_m_calendar_event_series').insert({ ...row, event_type: 'GROUP_SESSION' });
    const { data, error } = await query.select('series_id').single();
    if (error) {
      logger.error('calendarEventSeries:upsert_failed', error.message, { ...ctx, payload: formData });
      return { success: false, message: error.message };
    }
    logger.info('calendarEventSeries:upsert_success', `Calendar event series upserted: ${data.series_id}`, ctx);
    revalidatePath(SERIES_PATH, 'layout');
    revalidatePath('/calendar-events');
    return { success: true, seriesId: data.series_id };
  } catch (error) {
    logger.error('calendarEventSeries:upsert_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * シリーズの削除。属する回は削除せず、単発のイベントとして残す（series_id は ON DELETE SET NULL で外れる）
 */
export async function deleteCalendarEventSeries(seriesId: string): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('com_m_calendar_event_series').delete().eq('series_id', seriesId);
    if (error) {
      logger.error('calendarEventSeries:delete_failed', error.message, { ...ctx, payload: { seriesId } });
      return { success: false, message: error.message };
    }
    logger.info('calendarEventSeries:delete_success', 'Calendar event series deleted', { ...ctx, payload: { seriesId } });
    revalidatePath(SERIES_PATH, 'layout');
    revalidatePath('/calendar-events');
    return { success: true };
  } catch (error) {
    logger.error('calendarEventSeries:delete_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * シリーズに複数の回をまとめて登録する（admin_add_calendar_event_series_sessions。1件でも失敗したら登録しない）。
 * 参加確認はグループセッションの rsvpRequired に従う。終了時刻が開始時刻以前の場合は翌日の時刻とみなす。
 */
export async function addCalendarEventSeriesSessions(
  seriesId: string,
  common: SeriesSessionCommon,
  rows: SeriesSessionRow[]
): Promise<{ success: true; count: number } | { success: false; message: string }> {
  const ctx = await getLogContext();
  try {
    if (rows.length === 0) return { success: false, message: 'sessions_required' };
    const sessions = [];
    for (const row of rows) {
      const start = jstDateTimeToUtcIso(row.date, row.start_time);
      if (!start || !row.title.trim()) return { success: false, message: 'invalid_session' };
      let end = row.end_time ? jstDateTimeToUtcIso(row.date, row.end_time) : null;
      if (end && end <= start) end = new Date(new Date(end).getTime() + 24 * 60 * 60 * 1000).toISOString();
      sessions.push({
        title: row.title.trim(),
        description: row.description?.trim() || null,
        start_datetime: start,
        end_datetime: end,
        location_url: common.location_url || null,
        target_type: common.target_type,
        client_id: common.target_type === 'CLIENT' ? common.client_id || null : null,
        rsvp_enabled: CALENDAR_EVENT_TYPES.GROUP_SESSION.rsvpRequired,
        is_published: common.is_published,
        coach_ids: row.coach_ids,
      });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('admin_add_calendar_event_series_sessions', {
      p_series_id: seriesId,
      p_sessions: sessions,
    });
    if (error) {
      logger.error('calendarEventSeries:add_sessions_failed', error.message, { ...ctx, payload: { seriesId, count: rows.length } });
      return { success: false, message: error.message };
    }
    const count = Array.isArray(data) ? data.length : 0;
    logger.info('calendarEventSeries:add_sessions_success', `Added ${count} sessions`, { ...ctx, payload: { seriesId, count } });
    revalidatePath(SERIES_PATH, 'layout');
    revalidatePath('/calendar-events');
    return { success: true, count };
  } catch (error) {
    logger.error('calendarEventSeries:add_sessions_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}
