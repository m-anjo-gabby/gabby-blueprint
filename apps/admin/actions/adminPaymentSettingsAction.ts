'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { COMPANY_LOGO_BUCKET, CompanyProfile, SessionPayRate } from '@gabby/types/monthlyReport';

const logger = createLogger('admin');

// シングルトン運用の固定ID（supabase/DML/com_m_company_profile.sql, com_m_session_pay_rate.sql と一致させること）
const COMPANY_PROFILE_ID = '00000000-0000-0000-0000-000000000001';
const SESSION_PAY_RATE_ID = '00000000-0000-0000-0000-000000000001';

export async function getCompanyProfile(): Promise<CompanyProfile | null> {
  const ctx = await getLogContext();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('com_m_company_profile')
    .select('company_name, address, logo_path, tax_registration_number')
    .eq('company_profile_id', COMPANY_PROFILE_ID)
    .maybeSingle();

  if (error) {
    logger.error('admin:get_company_profile_failed', error.message, ctx);
    return null;
  }
  return data;
}

export async function updateCompanyProfile(
  input: Pick<CompanyProfile, 'company_name' | 'address' | 'tax_registration_number'>
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('com_m_company_profile')
    .update({
      company_name: input.company_name,
      address: input.address,
      tax_registration_number: input.tax_registration_number?.trim() || null,
      update_date: new Date().toISOString(),
    })
    .eq('company_profile_id', COMPANY_PROFILE_ID);

  if (error) {
    logger.error('admin:update_company_profile_failed', error.message, ctx);
    return { success: false, message: '会社情報の更新に失敗しました。' };
  }

  revalidatePath('/payment-settings');
  return { success: true };
}

/**
 * 会社ロゴ画像をStorage("company-logo"バケット)へアップロードし、
 * com_m_company_profile.logo_pathを更新する。
 */
export async function uploadCompanyLogo(
  file: File
): Promise<{ success: true; logoPath: string } | { success: false; message: string }> {
  const ctx = await getLogContext();
  if (!file || file.size === 0) {
    return { success: false, message: 'ロゴ画像ファイルを選択してください。' };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `logo-01.${ext}`;

  const supabase = createAdminClient();
  const { error: uploadError } = await supabase.storage.from(COMPANY_LOGO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/png',
  });
  if (uploadError) {
    logger.error('admin:upload_company_logo_failed', uploadError.message, ctx);
    return { success: false, message: 'ロゴ画像のアップロードに失敗しました。' };
  }

  const { error: updateError } = await supabase
    .from('com_m_company_profile')
    .update({ logo_path: path, update_date: new Date().toISOString() })
    .eq('company_profile_id', COMPANY_PROFILE_ID);
  if (updateError) {
    logger.error('admin:update_logo_path_failed', updateError.message, ctx);
    return { success: false, message: 'ロゴ画像は保存されましたが、パスの更新に失敗しました。' };
  }

  revalidatePath('/payment-settings');
  return { success: true, logoPath: path };
}

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
