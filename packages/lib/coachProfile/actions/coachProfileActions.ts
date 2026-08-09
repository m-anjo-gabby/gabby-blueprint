'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger, getLogContext } from '../../logger';
import {
  CoachProfileFormValues,
  GetMyCoachProfileResult,
  UpdateMyCoachProfileResult,
} from '@gabby/types/coachProfile';

const logger = createLogger('common');

const MAX_TEACHING_YEARS = 60;

/**
 * ログイン中コーチ自身の公開プロフィールを取得する（ポータル共通）
 */
export async function getMyCoachProfileCore(): Promise<GetMyCoachProfileResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_m_coach_profile')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      logger.error('coach_profile:get_my_profile_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    if (!data) {
      return { success: false, errorCode: 'not_found' };
    }

    return { success: true, profile: data };
  } catch (err) {
    logger.error('coach_profile:get_my_profile_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定ユーザーのコーチ公開プロフィールを取得する（ポータル共通）
 * RLSにより有効なコーチプロフィール（delete_flg='0'）のみ取得可能。
 * 生徒がコーチを選択する際の参照用途を想定。
 */
export async function getCoachProfileByUserIdCore(userId: string): Promise<GetMyCoachProfileResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('com_m_coach_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('coach_profile:get_profile_by_user_id_failed', error.message, { ...ctx, userId });
      return { success: false, errorCode: 'unexpected_error' };
    }

    if (!data) {
      return { success: false, errorCode: 'not_found' };
    }

    return { success: true, profile: data };
  } catch (err) {
    logger.error('coach_profile:get_profile_by_user_id_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ自身の公開プロフィールを更新する（ポータル共通）
 * 認証済み本人の com_m_coach_profile 行のみを更新する（RLS: user_id = auth.uid()）。
 */
export async function updateMyCoachProfileCore(values: CoachProfileFormValues): Promise<UpdateMyCoachProfileResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (
      values.teaching_years !== null &&
      (!Number.isInteger(values.teaching_years) || values.teaching_years < 0 || values.teaching_years > MAX_TEACHING_YEARS)
    ) {
      return { success: false, errorCode: 'invalid_input' };
    }

    if (values.country_code) {
      const { data: country, error: countryError } = await supabase
        .from('com_m_country')
        .select('country_code')
        .eq('country_code', values.country_code)
        .eq('delete_flg', '0')
        .maybeSingle();

      if (countryError || !country) {
        return { success: false, errorCode: 'invalid_input' };
      }
    }

    const { data, error: updateError } = await supabase
      .from('com_m_coach_profile')
      .update({
        country_code: values.country_code,
        coach_since: values.coach_since,
        education: values.education,
        qualifications: values.qualifications,
        teaching_years: values.teaching_years,
        job_experience: values.job_experience,
        introduction: values.introduction,
        update_date: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !data) {
      logger.error('coach_profile:update_my_profile_failed', updateError?.message ?? 'No row updated', { ...ctx, userId: user.id });
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('coach_profile:update_my_profile_success', 'Coach profile updated', { ...ctx, userId: user.id });
    return { success: true, profile: data };
  } catch (err) {
    logger.error('coach_profile:update_my_profile_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
