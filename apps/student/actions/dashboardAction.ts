'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';

const logger = createLogger('student');

/** ホームの「ご契約プラン」に表示する契約（ライセンス）1件分 */
export interface MyPlan {
  license_id: string;
  /** 生徒に見せるプラン名（管理用の契約名 contract_name は使わない） */
  plan_name: string;
  start_date: string;
  end_date: string;
}

/**
 * ログインユーザーの有効な契約（利用中・開始前）を開始日の早い順に取得する。
 * 有効の条件はログイン時のライセンス確認（status=1 かつ終了日前）と同じ。
 * 本人のライセンスと所属クライアントの契約は RLS で参照できる。
 */
export async function getMyActivePlans(): Promise<MyPlan[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) throw new Error('Unauthorized');

    const { data, error } = await supabase
      .from('com_t_user_license')
      .select('license_id, start_date, end_date, com_m_contract!inner(plan_name)')
      .eq('user_id', user.id)
      .eq('status', 1)
      .gte('end_date', new Date().toISOString())
      .order('start_date', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row) => ({
      license_id: row.license_id,
      // 多対一の結合のため実体は1件のオブジェクト（型生成なしのクライアントでは配列として推論される）
      plan_name: ([] as { plan_name: string }[]).concat(row.com_m_contract)[0]?.plan_name ?? '',
      start_date: row.start_date,
      end_date: row.end_date,
    }));
  } catch (err) {
    // ホームの補助表示のため、失敗時は契約なしと同じ扱いにして画面全体は表示させる
    logger.error('dashboard:get_active_plans_failed', getErrorMessage(err, String(err)), {
      ...ctx,
      err,
    });
    return [];
  }
}
