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

    const { data, error } = await supabase
      .from('com_m_calendar_event')
      .select('*')
      .gte('start_datetime', startIso)
      .lt('start_datetime', endIso)
      .order('start_datetime', { ascending: true });

    if (error) {
      logger.error('calendarEvent:get_published_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, events: (data ?? []) as CalendarEventItem[] };
  } catch (err) {
    logger.error('calendarEvent:get_published_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
