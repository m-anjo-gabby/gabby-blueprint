'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { SessionPayRate } from '@gabby/types/monthlyReport';

const logger = createLogger('admin');

// シングルトン運用の固定ID（supabase/DML/com_m_session_pay_rate.sql と一致させること）。
// 会社情報は法人ごとの管理に変わり、システム設定 > 会社情報（adminCompanyProfileAction.ts）へ移設した。
const SESSION_PAY_RATE_ID = '00000000-0000-0000-0000-000000000001';

export async function getSessionPayRate(): Promise<SessionPayRate | null> {
  const ctx = await getLogContext();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('com_m_session_pay_rate')
    .select('rate_amount, currency_code')
    .eq('session_pay_rate_id', SESSION_PAY_RATE_ID)
    .maybeSingle();

  if (error) {
    logger.error('admin:get_session_pay_rate_failed', error.message, ctx);
    return null;
  }
  return data;
}

export async function updateSessionPayRate(
  input: SessionPayRate
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  if (!(input.rate_amount >= 0)) {
    return { success: false, message: '単価には0以上の数値を指定してください。' };
  }
  if (!input.currency_code.trim()) {
    return { success: false, message: '通貨コードを指定してください。' };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('com_m_session_pay_rate')
    .update({
      rate_amount: input.rate_amount,
      currency_code: input.currency_code.trim().toUpperCase(),
      update_date: new Date().toISOString(),
    })
    .eq('session_pay_rate_id', SESSION_PAY_RATE_ID);

  if (error) {
    logger.error('admin:update_session_pay_rate_failed', error.message, ctx);
    return { success: false, message: 'セッション単価の更新に失敗しました。' };
  }

  revalidatePath('/payment-settings');
  return { success: true };
}
