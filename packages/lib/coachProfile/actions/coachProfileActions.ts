'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import {
  type CoachProfileFormValues,
  type CoachZoomSettingsFormValues,
  type GetMyCoachProfileResult,
  type UpdateMyCoachProfileResult,
  type UpdateMyCoachZoomSettingsResult,
} from '@gabby/types/coachProfile';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';

const logger = createLogger('common');

const MAX_TEACHING_YEARS = 60;

/** 空白だけの入力は未入力（null）として保存する（マッチングの必須項目の判定と揃える） */
const normalizeText = (value: string | null) => value?.trim() || null;

/**
 * ログイン中コーチ自身の公開プロフィールを取得する（ポータル共通）
 */
export async function getMyCoachProfileCore(): Promise<GetMyCoachProfileResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase.from('com_m_coach_profile').select('*').eq('user_id', user.id).maybeSingle();

    if (error) {
      logger.error('coachProfile:get_my_profile_failed', error.message, { ...ctx, err: error, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    if (!data) {
      return { success: false, errorCode: 'not_found' };
    }

    return { success: true, profile: data };
  } catch (err) {
    logger.error('coachProfile:get_my_profile_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定ユーザーのコーチ公開プロフィールを取得する（ポータル共通）
 * 生徒がコーチを選択する際の参照用途を想定。
 */
export async function getCoachProfileByUserIdCore(userId: string): Promise<GetMyCoachProfileResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.from('com_m_coach_profile').select('*').eq('user_id', userId).maybeSingle();

    if (error) {
      logger.error('coachProfile:get_profile_by_user_id_failed', error.message, { ...ctx, err: error, userId });
      return { success: false, errorCode: 'unexpected_error' };
    }

    if (!data) {
      return { success: false, errorCode: 'not_found' };
    }

    return { success: true, profile: data };
  } catch (err) {
    logger.error('coachProfile:get_profile_by_user_id_unexpected', getErrorMessage(err), { ...ctx, err });
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
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (
      values.teaching_years !== null &&
      (!Number.isInteger(values.teaching_years) ||
        values.teaching_years < 0 ||
        values.teaching_years > MAX_TEACHING_YEARS)
    ) {
      return { success: false, errorCode: 'invalid_input' };
    }

    if (values.country_code) {
      const { data: country, error: countryError } = await supabase
        .from('com_m_country')
        .select('country_code')
        .eq('country_code', values.country_code)
        .eq('is_active', true)
        .maybeSingle();

      if (countryError || !country) {
        return { success: false, errorCode: 'invalid_input' };
      }
    }

    const { data, error: updateError } = await supabase
      .from('com_m_coach_profile')
      .update({
        country_code: values.country_code,
        education: normalizeText(values.education),
        qualifications: normalizeText(values.qualifications),
        teaching_years: values.teaching_years,
        job_experience: normalizeText(values.job_experience),
        introduction: normalizeText(values.introduction),
        update_date: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !data) {
      logger.error('coachProfile:update_my_profile_failed', updateError?.message ?? 'No row updated', {
        ...ctx,
        err: updateError,
        userId: user.id,
      });
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('coachProfile:update_my_profile_success', 'Coach profile updated', { ...ctx, userId: user.id });
    return { success: true, profile: data };
  } catch (err) {
    logger.error('coachProfile:update_my_profile_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ自身のライブセッション用ビデオ通話URL(Zoom)を更新する（ポータル共通）
 * 「生徒に公開する自己紹介プロフィール」(updateMyCoachProfileCore)とは別カード・別アクションとして扱う。
 */
export async function updateMyCoachZoomSettingsCore(
  values: CoachZoomSettingsFormValues,
): Promise<UpdateMyCoachZoomSettingsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const trimmedUrl = values.zoom_meeting_url?.trim() || null;
    if (trimmedUrl && !/^https:\/\/.+/i.test(trimmedUrl)) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data, error: updateError } = await supabase
      .from('com_m_coach_profile')
      .update({
        zoom_meeting_url: trimmedUrl,
        update_date: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !data) {
      logger.error('coachProfile:update_my_zoom_settings_failed', updateError?.message ?? 'No row updated', {
        ...ctx,
        err: updateError,
        userId: user.id,
      });
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('coachProfile:update_my_zoom_settings_success', 'Coach zoom meeting URL updated', {
      ...ctx,
      userId: user.id,
    });
    return { success: true, profile: data };
  } catch (err) {
    logger.error('coachProfile:update_my_zoom_settings_unexpected', getErrorMessage(err), { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}
