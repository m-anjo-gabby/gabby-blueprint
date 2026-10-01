import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { createLogger } from '@gabby/lib/logger';
import { fetchCompanyProfile } from '@gabby/lib/companyProfile/fetchCompanyProfile';
import { getCompanyLogoUrl } from '@gabby/lib/companyProfile/getCompanyLogoUrl';
import { DOCUMENT_ISSUER } from '@gabby/types/companyProfile';
import { USER_TYPES } from '@gabby/types/user';
import type { TrainingReportData, TrainingReportTarget } from '@gabby/types/trainingReport';
import { TrainingReportDocument } from '@/lib/pdf/TrainingReportDocument';

const logger = createLogger('admin');

/** 呼び出し元が管理者か（PDFのダウンロードURLで使う。画面遷移は proxy.ts でも弾いている） */
export async function isAdminRequest(): Promise<boolean> {
  const user = await getAuthUser();
  return user?.app_metadata?.user_type === USER_TYPES.ADMIN;
}

/** "YYYY-MM" の月（日本時間）の始まりと翌月の始まり */
function jstMonthRange(yearMonth: string): { from: string; to: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const nextYearMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    from: new Date(`${yearMonth}-01T00:00:00+09:00`).toISOString(),
    to: new Date(`${nextYearMonth}-01T00:00:00+09:00`).toISOString(),
  };
}

/**
 * 満了日が指定月（日本時間）にあるライセンスの一覧。fetchedAt は取得時刻（期限を過ぎたかの判定に使う）
 */
export async function fetchTrainingReportTargets(
  yearMonth: string
): Promise<{ targets: TrainingReportTarget[]; fetchedAt: number } | null> {
  const { from, to } = jstMonthRange(yearMonth);
  const { data, error } = await createAdminClient().rpc('get_training_report_targets', { p_from: from, p_to: to });
  if (error) {
    logger.error('admin:get_training_report_targets_failed', error.message, { payload: { yearMonth } });
    return null;
  }
  return { targets: (data ?? []) as TrainingReportTarget[], fetchedAt: Date.now() };
}

/** PDFに載せるデータ（ライセンスごと） */
export async function fetchTrainingReportData(licenseIds: string[]): Promise<TrainingReportData[] | null> {
  if (licenseIds.length === 0) return [];
  const { data, error } = await createAdminClient().rpc('get_training_report_data', { p_license_ids: licenseIds });
  if (error) {
    logger.error('admin:get_training_report_data_failed', error.message, { payload: { count: licenseIds.length } });
    return null;
  }
  return (data ?? []) as TrainingReportData[];
}

/** 契約に紐づくライセンス（＝一括作成の対象） */
export async function fetchContractLicenseIds(contractId: string): Promise<{ contractName: string; licenseIds: string[] } | null> {
  const admin = createAdminClient();
  const [{ data: contract, error: contractError }, { data: licenses, error: licenseError }] = await Promise.all([
    admin.from('com_m_contract').select('contract_name').eq('contract_id', contractId).maybeSingle(),
    admin.from('com_t_user_license').select('license_id').eq('contract_id', contractId),
  ]);
  if (contractError || licenseError || !contract) {
    logger.error('admin:get_contract_licenses_failed', contractError?.message ?? licenseError?.message ?? 'contract not found', {
      payload: { contractId },
    });
    return null;
  }
  return { contractName: contract.contract_name, licenseIds: (licenses ?? []).map((l) => l.license_id) };
}

/**
 * レポートのPDFを作る。発行元（日本法人）の会社情報は1回だけ取得し、一括作成でも使い回す。
 * 1件ずつ順番に作る（並列にするとフォント・画像の読み込みが重なりメモリを多く使うため）。
 */
export async function renderTrainingReportPdfs(reports: TrainingReportData[]): Promise<Buffer[]> {
  const issuer = await fetchCompanyProfile(DOCUMENT_ISSUER.studentTrainingReport);
  const logoSrc = getCompanyLogoUrl(issuer?.logo_path);
  const issuedAt = new Date();

  const buffers: Buffer[] = [];
  for (const data of reports) {
    buffers.push(await renderToBuffer(TrainingReportDocument({ data, issuer, logoSrc, issuedAt })));
  }
  return buffers;
}
