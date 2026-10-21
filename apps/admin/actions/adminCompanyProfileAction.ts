'use server';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { COMPANY_PROFILE_SELECT } from '@gabby/lib/companyProfile/fetchCompanyProfile';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import type { ActionResult } from '@gabby/types/action';
import {
  COMPANY_CODE_ORDER,
  COMPANY_LOGO_BUCKET,
  isCompanyCode,
  type CompanyCode,
  type CompanyProfile,
} from '@gabby/types/companyProfile';
import { requireAdminRole, SYSTEM_ADMIN_ONLY } from '@/lib/adminAuth';

const logger = createLogger('admin');

const PAGE_PATH = '/company-profiles';

export type CompanyProfileInput = Pick<
  CompanyProfile,
  'company_name' | 'company_name_ja' | 'address' | 'tax_registration_number'
>;

/** 会社情報（法人ごと）を画面の表示順で取得する。取得に失敗した場合はnull */
export async function getCompanyProfiles(): Promise<CompanyProfile[] | null> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('com_m_company_profile').select(COMPANY_PROFILE_SELECT);

  if (error) {
    logger.error('admin:get_company_profiles_failed', error.message, { ...ctx, err: error });
    return null;
  }
  const rows = (data ?? []) as CompanyProfile[];
  return COMPANY_CODE_ORDER.flatMap((code) => rows.filter((row) => row.company_code === code));
}

export async function updateCompanyProfile(
  companyCode: CompanyCode,
  input: CompanyProfileInput,
): Promise<ActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  const t = await getTranslations('companyProfiles.errors');
  if (!isCompanyCode(companyCode)) return { success: false, message: t('invalidCompany') };

  const companyName = input.company_name.trim();
  const address = input.address.trim();
  if (!companyName || !address) {
    return { success: false, message: t('required') };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('com_m_company_profile')
    .update({
      company_name: companyName,
      company_name_ja: input.company_name_ja?.trim() || null,
      address,
      tax_registration_number: input.tax_registration_number?.trim() || null,
      update_date: new Date().toISOString(),
    })
    .eq('company_code', companyCode);

  if (error) {
    logger.error('admin:update_company_profile_failed', error.message, {
      ...ctx,
      err: error,
      payload: { companyCode },
    });
    return { success: false, message: t('updateFailed') };
  }

  revalidatePath(PAGE_PATH);
  return { success: true };
}

/**
 * 会社ロゴ画像をStorage("company-logo"バケット)へアップロードし、その法人の logo_path を更新する。
 * ファイル名は法人ごとに分ける（同じファイル名だと、片方の差し替えがもう片方の書面にも及ぶため）。
 */
export async function uploadCompanyLogo(
  companyCode: CompanyCode,
  file: File,
): Promise<ActionResult<{ logoPath: string }>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  const t = await getTranslations('companyProfiles.errors');
  if (!isCompanyCode(companyCode)) return { success: false, message: t('invalidCompany') };
  if (!file || file.size === 0) {
    return { success: false, message: t('logoRequired') };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${companyCode.toLowerCase().replace(/_/g, '-')}-logo.${ext}`;

  const supabase = createAdminClient();
  const { error: uploadError } = await supabase.storage.from(COMPANY_LOGO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/png',
  });
  if (uploadError) {
    logger.error('admin:upload_company_logo_failed', uploadError.message, {
      ...ctx,
      err: uploadError,
      payload: { companyCode },
    });
    return { success: false, message: t('logoUploadFailed') };
  }

  const { error: updateError } = await supabase
    .from('com_m_company_profile')
    .update({ logo_path: path, update_date: new Date().toISOString() })
    .eq('company_code', companyCode);
  if (updateError) {
    logger.error('admin:update_logo_path_failed', updateError.message, {
      ...ctx,
      err: updateError,
      payload: { companyCode },
    });
    return { success: false, message: t('logoPathFailed') };
  }

  revalidatePath(PAGE_PATH);
  return { success: true, logoPath: path };
}
