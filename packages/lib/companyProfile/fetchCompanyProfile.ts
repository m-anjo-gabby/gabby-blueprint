import { createAdminClient } from '../supabase/admin';
import type { CompanyCode, CompanyProfile } from '@gabby/types/companyProfile';

export const COMPANY_PROFILE_SELECT = 'company_code, company_name, company_name_ja, address, logo_path, tax_registration_number';

/**
 * 書面（PDF）の発行元の会社情報を法人コードで取得する（サーバー専用）。
 * com_m_company_profile はRLSで管理者のみ参照可能なため、コーチ向け支払通知書のように
 * 管理者以外の画面から書面を作る場合も含め、service_role で読む。
 * 発行元の法人は DOCUMENT_ISSUER（packages/types/companyProfile.ts）で指定する。
 */
export async function fetchCompanyProfile(companyCode: CompanyCode): Promise<CompanyProfile | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('com_m_company_profile')
    .select(COMPANY_PROFILE_SELECT)
    .eq('company_code', companyCode)
    .maybeSingle();
  return (data as CompanyProfile | null) ?? null;
}
