'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { ilikeAny } from '@gabby/lib/supabase/ilike';
import {
  TRIAL_APPLICATION_STATUSES,
  TRIAL_OCCUPATIONS,
  type TrialApplicationRow,
  type TrialApplicationStatus,
} from '@gabby/types/trialApplication';
import { toRange, type ListParams, type ListResult } from '@/lib/list';

const logger = createLogger('admin');

/**
 * Webトライアルの申込一覧（閲覧のみ。氏名・ローマ字・メールの部分一致検索・状態/業種での絞り込み）。
 * 状態はビュー private.vw_trial_application_list が判定する。
 */
export async function getTrialApplications(
  params: ListParams<'status' | 'occupation'>,
): Promise<ListResult<TrialApplicationRow>> {
  const ctx = await getLogContext();
  const { q, filters } = params;
  // 既知の値だけを条件にする（不正な値は「すべて」として扱う）
  const status = TRIAL_APPLICATION_STATUSES.includes(filters.status as TrialApplicationStatus) ? filters.status : '';
  const occupation = TRIAL_OCCUPATIONS.some((o) => String(o.code) === filters.occupation)
    ? Number(filters.occupation)
    : null;
  try {
    const supabase = createAdminClient();
    const [from, to] = toRange(params);

    let query = supabase.schema('private').from('vw_trial_application_list').select('*', { count: 'exact' });
    if (q) query = query.or(ilikeAny(['full_name', 'full_name_latin', 'email'], q));
    if (status) query = query.eq('status', status);
    if (occupation !== null) query = query.eq('occupation', occupation);

    const { data, count, error } = await query
      .order('last_applied_at', { ascending: false })
      .order('application_id', { ascending: true }) // 同順位の並びを一意に固定し、range(LIMIT/OFFSET)でのページ間の重複・欠落を防ぐ
      .range(from, to);

    if (error) {
      logger.error('trial:get_trial_applications_failed', error.message, {
        ...ctx,
        err: error,
        payload: { from, to, status, occupation },
      });
      throw new Error(error.message);
    }
    return { rows: (data ?? []) as TrialApplicationRow[], totalCount: count ?? 0 };
  } catch (error) {
    logger.error('trial:get_trial_applications_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      err: error,
    });
    throw error instanceof Error ? error : new Error('Unexpected error');
  }
}
