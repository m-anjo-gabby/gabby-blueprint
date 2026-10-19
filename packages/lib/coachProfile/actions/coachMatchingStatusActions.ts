'use server';

import { unstable_rethrow } from 'next/navigation';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import {
  COACH_MATCHING_REQUIRED_ITEMS,
  type CoachMatchingRequiredItem,
  type GetCoachMatchingStatusResult,
  type UpdateMyAcceptingStudentsResult,
} from '@gabby/types/coachProfile';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { createServerClient } from '../../supabase/server';

const logger = createLogger('common');

interface CoachMatchingStatusRow {
  missing_items: string[] | null;
  accepting_students: boolean;
  is_suspended: boolean;
  suspended_note: string | null;
  suspended_at: string | null;
  is_demo: boolean;
}

const isRequiredItem = (item: string): item is CoachMatchingRequiredItem =>
  (COACH_MATCHING_REQUIRED_ITEMS as readonly string[]).includes(item);

/**
 * コーチが生徒の「専属コーチを探す」に出るかどうかの内訳を取得する（ポータル共通。get_coach_matching_status RPC）。
 * コーチ本人とアドミンだけが取得できる（休止の理由のメモはアドミンにだけ返る）。
 * RPC が JWT で本人・アドミンを判定するため、service_role ではなくログイン中のクライアントで呼ぶ。
 */
export async function getCoachMatchingStatusCore(coachId: string): Promise<GetCoachMatchingStatusResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .rpc('get_coach_matching_status', { p_coach_id: coachId })
      .maybeSingle<CoachMatchingStatusRow>();

    if (error) {
      if (error.message.includes('NOT_AUTHORIZED')) {
        logger.warn('coachProfile:get_matching_status_denied', error.message, {
          ...ctx,
          userId: user.id,
          payload: { coachId },
        });
        return { success: false, errorCode: 'unauthorized' };
      }
      if (error.message.includes('COACH_NOT_FOUND')) return { success: false, errorCode: 'not_found' };
      logger.error('coachProfile:get_matching_status_failed', error.message, {
        ...ctx,
        err: error,
        userId: user.id,
        payload: { coachId },
      });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!data) return { success: false, errorCode: 'not_found' };

    return {
      success: true,
      status: {
        missingItems: (data.missing_items ?? []).filter(isRequiredItem),
        acceptingStudents: data.accepting_students,
        isSuspended: data.is_suspended,
        suspendedNote: data.suspended_note,
        suspendedAt: data.suspended_at,
        isDemo: data.is_demo,
      },
    };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('coachProfile:get_matching_status_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { coachId },
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ自身の新規の生徒の受付を切り替える（ポータル共通）。
 * OFFにしても担当中の生徒・確定済みのセッションはそのまま（生徒の「専属コーチを探す」に出なくなるだけ）。
 */
export async function updateMyAcceptingStudentsCore(
  acceptingStudents: boolean,
): Promise<UpdateMyAcceptingStudentsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_m_coach_profile')
      .update({ accepting_students: acceptingStudents, update_date: new Date().toISOString() })
      .eq('user_id', user.id)
      .select('accepting_students')
      .single();

    if (error || !data) {
      logger.error('coachProfile:update_accepting_students_failed', error?.message ?? 'No row updated', {
        ...ctx,
        err: error,
        userId: user.id,
      });
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('coachProfile:update_accepting_students_success', 'Coach accepting students updated', {
      ...ctx,
      userId: user.id,
      payload: { acceptingStudents: data.accepting_students },
    });
    return { success: true, acceptingStudents: data.accepting_students };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('coachProfile:update_accepting_students_unexpected', getErrorMessage(err), { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}
