'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  CalendarEventItem,
  CalendarEventType,
  CalendarEventTargetType,
  CalendarEventCoachOption,
  CalendarEventMessageItem,
  CalendarEventMessageAttachment,
} from '@gabby/types/calendarEvent';

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
  rsvp_enabled: boolean;
  is_published: boolean;
  coach_ids: string[]; // 担当コーチ（主にグループセッション用。原則1〜3名だが上限は設けない）
}

export interface CalendarEventParticipant {
  participant_id: string;
  user_id: string;
  user_name: string | null;
  user_type: string | null;
  insert_date: string;
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

    const coachesByEventId = await getCoachesByEventId((data ?? []).map((row) => row.calendar_event_id));

    // is_joined/is_assigned_coach は生徒/コーチ向けクエリでのみ計算する結合フィールドのため、管理一覧では常にfalseとする
    return (data ?? []).map((row) => ({
      ...row,
      is_joined: false,
      is_assigned_coach: false,
      coaches: coachesByEventId.get(row.calendar_event_id) ?? [],
    })) as CalendarEventItem[];
  } catch (error) {
    logger.error('calendarEvent:get_calendar_events_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 担当コーチの候補一覧取得（選択肢用・軽量・全件）
 */
export async function getCoachesFilter(): Promise<CalendarEventCoachOption[]> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_user')
      .select('id, user_name')
      .eq('user_type', '2')
      .eq('delete_flg', '0')
      .order('user_name');

    if (error) {
      logger.error('calendarEvent:get_coaches_filter_failed', error.message, ctx);
      return [];
    }

    return (data ?? []).map((row) => ({ coach_id: row.id, user_name: row.user_name }));
  } catch (error) {
    logger.error('calendarEvent:get_coaches_filter_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    return [];
  }
}

/**
 * 指定イベントID群に対する担当コーチをまとめて取得し、イベントID単位でグルーピングする
 */
async function getCoachesByEventId(calendarEventIds: string[]): Promise<Map<string, CalendarEventCoachOption[]>> {
  const map = new Map<string, CalendarEventCoachOption[]>();
  if (calendarEventIds.length === 0) return map;

  const ctx = await getLogContext();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('com_t_calendar_event_coach')
    .select('calendar_event_id, coach_id, com_m_user(user_name)')
    .in('calendar_event_id', calendarEventIds);

  if (error) {
    logger.error('calendarEvent:get_coaches_by_event_failed', error.message, ctx);
    return map;
  }

  for (const row of (data ?? []) as any[]) {
    const list = map.get(row.calendar_event_id) ?? [];
    list.push({ coach_id: row.coach_id, user_name: row.com_m_user?.user_name ?? null });
    map.set(row.calendar_event_id, list);
  }
  return map;
}

/**
 * カレンダーイベントの担当コーチ割当を最新の状態に同期する（全削除→再登録）。
 * 原則1〜3名程度の少数想定のため、差分計算より全削除→再登録の方が単純で確実。
 */
async function syncCalendarEventCoaches(calendarEventId: string, coachIds: string[]): Promise<void> {
  const ctx = await getLogContext();
  const supabase = createAdminClient();

  const { error: deleteError } = await supabase.from('com_t_calendar_event_coach').delete().eq('calendar_event_id', calendarEventId);
  if (deleteError) {
    logger.error('calendarEvent:sync_coaches_delete_failed', deleteError.message, { ...ctx, payload: { calendarEventId } });
    throw new Error(deleteError.message);
  }

  if (coachIds.length === 0) return;

  const rows = coachIds.map((coachId) => ({ calendar_event_id: calendarEventId, coach_id: coachId }));
  const { error: insertError } = await supabase.from('com_t_calendar_event_coach').insert(rows);
  if (insertError) {
    logger.error('calendarEvent:sync_coaches_insert_failed', insertError.message, { ...ctx, payload: { calendarEventId, coachIds } });
    throw new Error(insertError.message);
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
      rsvp_enabled: formData.rsvp_enabled,
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

    await syncCalendarEventCoaches(data.calendar_event_id, formData.coach_ids ?? []);

    const saved = { ...data, is_joined: false, is_assigned_coach: false, coaches: [] } as CalendarEventItem;
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

/**
 * カレンダーイベント単位の参加者一覧取得（rsvp_enabled=TRUEのイベント用）
 * お知らせの既読状況と異なり「参加した人だけ」を対象とするため、
 * 配信対象母集団との突合は行わない単純な一覧取得。
 */
export async function getCalendarEventParticipants(
  calendarEventId: string
): Promise<{ event: CalendarEventItem | null; participants: CalendarEventParticipant[]; totalCount: number }> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: event, error: eventError } = await supabase
      .from('com_m_calendar_event')
      .select('*')
      .eq('calendar_event_id', calendarEventId)
      .single();

    if (eventError || !event) {
      logger.error('calendarEvent:get_participants_event_not_found', eventError?.message || 'event not found', {
        ...ctx,
        payload: { calendarEventId },
      });
      return { event: null, participants: [], totalCount: 0 };
    }

    const { data, error } = await supabase
      .from('com_t_calendar_event_participant')
      .select('participant_id, user_id, insert_date, com_m_user(user_name, user_type)')
      .eq('calendar_event_id', calendarEventId)
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error('calendarEvent:get_participants_failed', error.message, { ...ctx, payload: { calendarEventId } });
      return { event: { ...event, is_joined: false, is_assigned_coach: false } as CalendarEventItem, participants: [], totalCount: 0 };
    }

    const participants: CalendarEventParticipant[] = (data ?? []).map((row: any) => ({
      participant_id: row.participant_id,
      user_id: row.user_id,
      user_name: row.com_m_user?.user_name ?? null,
      user_type: row.com_m_user?.user_type ?? null,
      insert_date: row.insert_date,
    }));

    return {
      event: { ...event, is_joined: false, is_assigned_coach: false } as CalendarEventItem,
      participants,
      totalCount: participants.length,
    };
  } catch (error) {
    logger.error('calendarEvent:get_participants_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      payload: { calendarEventId },
    });
    return { event: null, participants: [], totalCount: 0 };
  }
}

export interface CalendarEventMessageFormData {
  calendar_event_message_id?: string; // 添付ファイルのStorageパス採番のため、送信前にクライアント側で生成する
  title: string;
  content: string;
  attachments: CalendarEventMessageAttachment[];
}

/**
 * カレンダーイベント単位のアナウンス配信履歴を取得（新しい順）
 */
export async function getCalendarEventMessages(calendarEventId: string): Promise<CalendarEventMessageItem[]> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_t_calendar_event_message')
      .select('*')
      .eq('calendar_event_id', calendarEventId)
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error('calendarEvent:get_messages_failed', error.message, { ...ctx, payload: { calendarEventId } });
      return [];
    }

    return (data ?? []).map((row: any) => ({ ...row, attachments: Array.isArray(row.attachments) ? row.attachments : [] }));
  } catch (error) {
    logger.error('calendarEvent:get_messages_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      payload: { calendarEventId },
    });
    return [];
  }
}

/**
 * カレンダーイベントへのアナウンス送信（新規作成）
 */
export async function createCalendarEventMessage(
  calendarEventId: string,
  formData: CalendarEventMessageFormData
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  try {
    if (!formData.title.trim() || !formData.content.trim()) {
      return { success: false, message: 'タイトルと本文は必須です' };
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from('com_t_calendar_event_message').insert({
      ...(formData.calendar_event_message_id ? { calendar_event_message_id: formData.calendar_event_message_id } : {}),
      calendar_event_id: calendarEventId,
      title: formData.title,
      content: formData.content,
      attachments: formData.attachments,
    });

    if (error) {
      logger.error('calendarEvent:create_message_failed', error.message, { ...ctx, payload: { calendarEventId, ...formData } });
      return { success: false, message: error.message };
    }

    logger.info('calendarEvent:create_message_success', 'Calendar event message sent', { ...ctx, payload: { calendarEventId } });

    revalidatePath(`/calendar-events/${calendarEventId}/participants`);
    return { success: true };
  } catch (error) {
    logger.error('calendarEvent:create_message_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      payload: { calendarEventId },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * アナウンスの更新（編集）
 */
export async function updateCalendarEventMessage(
  calendarEventMessageId: string,
  calendarEventId: string,
  formData: CalendarEventMessageFormData
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  try {
    if (!formData.title.trim() || !formData.content.trim()) {
      return { success: false, message: 'タイトルと本文は必須です' };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('com_t_calendar_event_message')
      .update({
        title: formData.title,
        content: formData.content,
        attachments: formData.attachments,
        update_date: new Date().toISOString(),
      })
      .eq('calendar_event_message_id', calendarEventMessageId);

    if (error) {
      logger.error('calendarEvent:update_message_failed', error.message, { ...ctx, payload: { calendarEventMessageId, ...formData } });
      return { success: false, message: error.message };
    }

    logger.info('calendarEvent:update_message_success', 'Calendar event message updated', { ...ctx, payload: { calendarEventMessageId } });

    revalidatePath(`/calendar-events/${calendarEventId}/participants`);
    return { success: true };
  } catch (error) {
    logger.error('calendarEvent:update_message_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      payload: { calendarEventMessageId },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * アナウンスの削除（誤送信時の取り消し用。添付ファイルもStorageから物理削除する）
 */
export async function deleteCalendarEventMessage(
  calendarEventMessageId: string,
  calendarEventId: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: message, error: fetchError } = await supabase
      .from('com_t_calendar_event_message')
      .select('attachments')
      .eq('calendar_event_message_id', calendarEventMessageId)
      .single();

    if (fetchError) {
      logger.error('calendarEvent:delete_message_fetch_failed', fetchError.message, { ...ctx, payload: { calendarEventMessageId } });
      return { success: false, message: fetchError.message };
    }

    const attachments: CalendarEventMessageAttachment[] = Array.isArray(message?.attachments) ? message.attachments : [];
    if (attachments.length > 0) {
      await supabase.storage.from('calendar-event-message').remove(attachments.map((a) => a.path));
    }

    const { error } = await supabase
      .from('com_t_calendar_event_message')
      .delete()
      .eq('calendar_event_message_id', calendarEventMessageId);

    if (error) {
      logger.error('calendarEvent:delete_message_failed', error.message, { ...ctx, payload: { calendarEventMessageId } });
      return { success: false, message: error.message };
    }

    logger.info('calendarEvent:delete_message_success', 'Calendar event message deleted', { ...ctx, payload: { calendarEventMessageId } });

    revalidatePath(`/calendar-events/${calendarEventId}/participants`);
    return { success: true };
  } catch (error) {
    logger.error('calendarEvent:delete_message_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      payload: { calendarEventMessageId },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * アナウンス添付ファイルのアップロード（FormData）
 * Storageバケット "calendar-event-message" に calendar-event-message/{calendar_event_message_id}/{file.name} で保存
 */
export async function uploadCalendarEventMessageFile(
  calendarEventMessageId: string,
  formData: FormData
): Promise<{ success: boolean; attachment?: CalendarEventMessageAttachment; message?: string }> {
  const ctx = await getLogContext();
  try {
    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, message: 'ファイルが選択されていません' };
    }

    const supabase = createAdminClient();

    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `calendar-event-message/${calendarEventMessageId}/${cleanFileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('calendar-event-message')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      logger.error('calendarEvent:upload_message_file_failed', uploadError.message, {
        ...ctx,
        payload: { calendarEventMessageId, fileName: file.name },
      });
      return { success: false, message: `アップロードに失敗しました: ${uploadError.message}` };
    }

    const newAttachment: CalendarEventMessageAttachment = {
      id: crypto.randomUUID(),
      name: file.name,
      path: storagePath,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
    };

    logger.info('calendarEvent:upload_message_file_success', `Attachment uploaded: ${storagePath}`, {
      ...ctx,
      payload: { calendarEventMessageId, storagePath },
    });

    return { success: true, attachment: newAttachment };
  } catch (error) {
    logger.error('calendarEvent:upload_message_file_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      payload: { calendarEventMessageId },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * アナウンス添付ファイルの公開URLを取得（"calendar-event-message" はPublicバケット）
 */
export async function getCalendarEventMessageAttachmentUrl(path: string): Promise<{ url: string | null }> {
  const supabase = createAdminClient();
  const { data } = supabase.storage.from('calendar-event-message').getPublicUrl(path);
  return { url: data?.publicUrl ?? null };
}

/**
 * アナウンス添付ファイルの削除（Storageから物理削除。送信前の差し替え用）
 */
export async function deleteCalendarEventMessageFile(storagePath: string): Promise<{ success: boolean; message?: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const cleanPath = storagePath.startsWith('/') ? storagePath.substring(1) : storagePath;

    const { error } = await supabase.storage.from('calendar-event-message').remove([cleanPath]);

    if (error) {
      logger.error('calendarEvent:delete_message_file_failed', error.message, { ...ctx, payload: { storagePath } });
      return { success: false, message: error.message };
    }

    return { success: true };
  } catch (error) {
    logger.error('calendarEvent:delete_message_file_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      payload: { storagePath },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}
