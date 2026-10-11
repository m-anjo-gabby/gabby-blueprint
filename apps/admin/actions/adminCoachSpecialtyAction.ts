'use server';

import { z } from 'zod';
import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  getCoachSpecialtyCodesCore,
  getCoachSpecialtyListCore,
} from '@gabby/lib/coachSpecialty/actions/coachSpecialtyActions';
import { CoachSpecialtyMaster } from '@gabby/types/coachSpecialty';

const logger = createLogger('admin');

export interface CoachSpecialtySettings {
  /** 専門マスタ（表示順） */
  master: CoachSpecialtyMaster[];
  /** コーチに設定されている専門コード */
  codes: string[];
}

export type SetCoachSpecialtiesResult =
  | { success: true; codes: string[] }
  | { success: false; errorCode: 'too_many_fields' | 'failed' };

const setCoachSpecialtiesInput = z.object({
  coachId: z.uuid(),
  codes: z.array(z.string().min(1)).max(50),
});

/**
 * コーチの専門の設定ダイアログ用に、専門マスタとコーチの現在の設定を取得する。取得に失敗した場合は null。
 */
export async function getCoachSpecialtySettings(coachId: string): Promise<CoachSpecialtySettings | null> {
  const [listResult, codesByCoachId] = await Promise.all([
    getCoachSpecialtyListCore(),
    getCoachSpecialtyCodesCore([coachId]),
  ]);
  if (!listResult.success) return null;
  return { master: listResult.specialties, codes: codesByCoachId.get(coachId) ?? [] };
}

/**
 * コーチの専門を、渡したコードの集合に置き換える（admin_set_coach_specialties。アドミン以外・分野が上限を超える場合はDB側で拒否）。
 */
export async function setCoachSpecialties(coachId: string, codes: string[]): Promise<SetCoachSpecialtiesResult> {
  const ctx = await getLogContext();
  const parsed = setCoachSpecialtiesInput.safeParse({ coachId, codes });
  if (!parsed.success) return { success: false, errorCode: 'failed' };

  try {
    // RPC がアドミンかどうかを JWT で判定するため、service_role ではなくログイン中のクライアントで呼ぶ
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('admin_set_coach_specialties', {
      p_coach_id: parsed.data.coachId,
      p_specialty_codes: parsed.data.codes,
    });
    if (error) {
      if (error.message.includes('TOO_MANY_FIELDS')) {
        logger.warn('coach_specialty:admin_set_denied', error.message, { ...ctx, payload: { coachId } });
        return { success: false, errorCode: 'too_many_fields' };
      }
      logger.error('coach_specialty:admin_set_failed', error.message, { ...ctx, err: error, payload: { coachId } });
      return { success: false, errorCode: 'failed' };
    }

    const savedCodes = (data ?? []) as string[];
    logger.info('coach_specialty:admin_set_success', 'Coach specialties updated', {
      ...ctx,
      payload: { coachId, codes: savedCodes },
    });
    return { success: true, codes: savedCodes };
  } catch (err) {
    logger.error('coach_specialty:admin_set_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      err,
      payload: { coachId },
    });
    return { success: false, errorCode: 'failed' };
  }
}
