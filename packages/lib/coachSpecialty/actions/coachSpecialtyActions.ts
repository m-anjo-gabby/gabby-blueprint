'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { type GetCoachSpecialtyListResult } from '@gabby/types/coachSpecialty';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';

const logger = createLogger('common');

/**
 * コーチの専門マスタの一覧を取得する（ポータル共通、認証済みユーザーであれば取得可能）。表示順に並べて返す。
 */
export async function getCoachSpecialtyListCore(): Promise<GetCoachSpecialtyListResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('com_m_coach_specialty')
      .select('specialty_code, kind, name_en, name_ja, sort_no')
      .eq('is_active', true)
      .order('sort_no', { ascending: true });

    if (error) {
      logger.error('coach_specialty:get_list_failed', error.message, { ...ctx, err: error });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, specialties: data ?? [] };
  } catch (err) {
    logger.error('coach_specialty:get_list_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定したコーチに設定された専門コードを取得する（ポータル共通。設定はログイン済みなら誰でも参照できる）。
 * 専門が未設定のコーチは結果に含まれない。取得に失敗した場合も空として返す（専門なしとして表示する）。
 */
export async function getCoachSpecialtyCodesCore(coachIds: string[]): Promise<Map<string, string[]>> {
  const codesById = new Map<string, string[]>();
  if (coachIds.length === 0) return codesById;

  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('com_m_coach_specialty_assignment')
      .select('coach_id, specialty_code')
      .in('coach_id', coachIds);

    if (error) {
      logger.error('coach_specialty:get_codes_failed', error.message, { ...ctx, err: error });
      return codesById;
    }
    for (const row of data ?? []) {
      const list = codesById.get(row.coach_id) ?? [];
      list.push(row.specialty_code);
      codesById.set(row.coach_id, list);
    }
    return codesById;
  } catch (err) {
    logger.error('coach_specialty:get_codes_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return codesById;
  }
}
