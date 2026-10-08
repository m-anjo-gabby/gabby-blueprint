'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import {
  CoachAvailabilityFormValues,
  CoachAvailabilitySlot,
  GetCoachAvailabilityResult,
  AddCoachAvailabilityResult,
  DeleteCoachAvailabilityResult,
  GetAvailabilityConfirmedAtResult,
  ConfirmAvailabilityResult,
} from '@gabby/types/coachAvailability';
import { getAuthUser } from '@gabby/lib/supabase/authUser';

const logger = createLogger('common');

function isValidTimeRange(startTime: string, endTime: string): boolean {
  return /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime) && startTime < endTime;
}

/**
 * ログイン中コーチ自身の空き時間一覧を取得する（ポータル共通）
 */
export async function getMyAvailabilityCore(): Promise<GetCoachAvailabilityResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_m_coach_availability')
      .select('*')
      .eq('coach_id', user.id)
      .eq('delete_flg', '0')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      logger.error('coachAvailability:get_my_availability_failed', error.message, { ...ctx, err: error, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, slots: (data ?? []) as CoachAvailabilitySlot[] };
  } catch (err) {
    logger.error('coachAvailability:get_my_availability_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定コーチの有効な空き時間一覧を取得する（ポータル共通）
 * 生徒がコーチを選択する際の参照用途を想定（RLSにより有効な行のみ取得可能）。
 */
export async function getCoachAvailabilityByUserIdCore(coachId: string): Promise<GetCoachAvailabilityResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('com_m_coach_availability')
      .select('*')
      .eq('coach_id', coachId)
      .eq('delete_flg', '0')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      logger.error('coachAvailability:get_by_coach_id_failed', error.message, { ...ctx, err: error, payload: { coachId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, slots: (data ?? []) as CoachAvailabilitySlot[] };
  } catch (err) {
    logger.error('coachAvailability:get_by_coach_id_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ自身の空き時間を1件追加する（ポータル共通）
 * 曜日・時刻はUTC（画面側でコーチの現地時刻から換算する）。日の終わりは "24:00"。
 * 追加・削除のたびにDBのトリガーで「確認済み」（availability_confirmed_at）になる。
 */
export async function addAvailabilityCore(values: CoachAvailabilityFormValues): Promise<AddCoachAvailabilityResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (
      values.day_of_week < 0 || values.day_of_week > 6 ||
      !isValidTimeRange(values.start_time, values.end_time)
    ) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data, error } = await supabase
      .from('com_m_coach_availability')
      .insert({
        coach_id: user.id,
        day_of_week: values.day_of_week,
        start_time: `${values.start_time}:00`,
        end_time: `${values.end_time}:00`,
      })
      .select('*')
      .single();

    if (error || !data) {
      logger.error('coachAvailability:add_failed', error?.message ?? 'No row inserted', { ...ctx, err: error, userId: user.id });
      return { success: false, errorCode: 'db_insert_failed' };
    }

    logger.info('coachAvailability:add_success', 'Coach availability slot added', { ...ctx, userId: user.id });
    return { success: true, slot: data as CoachAvailabilitySlot };
  } catch (err) {
    logger.error('coachAvailability:add_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ自身の空き時間を1件削除する（論理削除。ポータル共通）
 */
export async function deleteAvailabilityCore(availabilityId: string): Promise<DeleteCoachAvailabilityResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase
      .from('com_m_coach_availability')
      .update({ delete_flg: '1', update_date: new Date().toISOString() })
      .eq('availability_id', availabilityId)
      .eq('coach_id', user.id);

    if (error) {
      logger.error('coachAvailability:delete_failed', error.message, { ...ctx, err: error, userId: user.id, payload: { availabilityId } });
      return { success: false, errorCode: 'db_delete_failed' };
    }

    logger.info('coachAvailability:delete_success', 'Coach availability slot removed', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('coachAvailability:delete_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ自身の、空き時間を最後に確認した日時を取得する（ポータル共通）
 */
export async function getMyAvailabilityConfirmedAtCore(): Promise<GetAvailabilityConfirmedAtResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_m_coach_profile')
      .select('availability_confirmed_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      logger.error('coachAvailability:get_confirmed_at_failed', error.message, { ...ctx, err: error, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, confirmedAt: data?.availability_confirmed_at ?? null };
  } catch (err) {
    logger.error('coachAvailability:get_confirmed_at_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ自身の空き時間を「変更なしで確認」する（ポータル共通）。
 * 確認日時を更新し、見直しの通知（COACH_AVAILABILITY_REMINDER）を既読にする（confirm_my_coach_availability RPC）。
 */
export async function confirmMyAvailabilityCore(): Promise<ConfirmAvailabilityResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase.rpc('confirm_my_coach_availability');

    if (error || !data) {
      logger.error('coachAvailability:confirm_failed', error?.message ?? 'No timestamp returned', { ...ctx, err: error, userId: user.id });
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('coachAvailability:confirm_success', 'Coach availability confirmed without changes', { ...ctx, userId: user.id });
    return { success: true, confirmedAt: data as string };
  } catch (err) {
    logger.error('coachAvailability:confirm_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}
