'use server';

import { z } from 'zod';
import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getCoachMatchingStatusCore } from '@gabby/lib/coachProfile/actions/coachMatchingStatusActions';
import { CoachMatchingStatus } from '@gabby/types/coachProfile';

const logger = createLogger('admin');

const MAX_NOTE_LENGTH = 500;

export type SetCoachMatchingSuspensionResult = { success: true } | { success: false };

const setSuspensionInput = z.object({
  coachId: z.uuid(),
  suspended: z.boolean(),
  note: z.string().max(MAX_NOTE_LENGTH).nullable(),
});

/**
 * コーチが生徒の「専属コーチを探す」に出るかどうかの内訳（足りない項目・本人の受付・休止とその理由）。取得に失敗した場合は null。
 */
export async function getCoachMatchingStatus(coachId: string): Promise<CoachMatchingStatus | null> {
  const result = await getCoachMatchingStatusCore(coachId);
  return result.success ? result.status : null;
}

/**
 * コーチのマッチングを休止・解除する（admin_set_coach_matching_suspension。アドミン以外はDB側で拒否）。
 * 休止で止めるのは新しいマッチングだけ（担当中の生徒・確定済みのセッションはそのまま）。
 */
export async function setCoachMatchingSuspension(
  coachId: string,
  suspended: boolean,
  note: string | null,
): Promise<SetCoachMatchingSuspensionResult> {
  const ctx = await getLogContext();
  const parsed = setSuspensionInput.safeParse({ coachId, suspended, note });
  if (!parsed.success) return { success: false };

  try {
    // RPC がアドミンかどうかを JWT で判定するため、service_role ではなくログイン中のクライアントで呼ぶ
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('admin_set_coach_matching_suspension', {
      p_coach_id: parsed.data.coachId,
      p_suspended: parsed.data.suspended,
      p_note: parsed.data.note,
    });
    if (error) {
      logger.error('coach_matching:admin_set_suspension_failed', error.message, {
        ...ctx,
        err: error,
        payload: { coachId },
      });
      return { success: false };
    }

    logger.info('coach_matching:admin_set_suspension_success', 'Coach matching suspension updated', {
      ...ctx,
      payload: { coachId, suspended: parsed.data.suspended },
    });
    return { success: true };
  } catch (err) {
    logger.error(
      'coach_matching:admin_set_suspension_unexpected',
      err instanceof Error ? err.message : 'Unknown error',
      {
        ...ctx,
        err,
        payload: { coachId },
      },
    );
    return { success: false };
  }
}
