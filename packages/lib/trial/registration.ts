/**
 * Webトライアルの本登録（パスワード設定）時の処理（サーバー専用）。
 * 招待からの本登録（acceptInvitationCore）が、招待にトライアルの申込（com_t_trial_application）が
 * 紐づいている場合に呼ぶ。契約は申込時ではなく本登録の月で決め、ライセンスは本登録の日から14日間にする。
 *
 * 'use server' は付けない（外部から直接呼べるエンドポイントにしないため）。
 */
import 'server-only';
import { WEB_TRIAL_LICENSE_DAYS } from '@gabby/types/trialApplication';
import type { LegalName } from '@gabby/types/userLegal';
import { toIsoDateInZone, zonedWallClockToUtc } from '../date/date';
import { REPORTING_TIMEZONE } from '../date/reporting';
import { issueInitialLicense } from '../license/issue';
import { createLogger, type LogContext } from '../logger';
import type { createAdminClient } from '../supabase/admin';

const logger = createLogger('common');

type AdminClient = ReturnType<typeof createAdminClient>;

/** 本登録で使う申込の内容（タイムゾーン・正式な氏名の元になる姓・名） */
export interface TrialApplicationForRegistration extends LegalName {
  application_id: string;
  timezone: string;
}

/**
 * 招待に紐づくトライアルの申込（無ければトライアルではない）。
 * ユーザーの作成後に呼ぶため、取得に失敗しても本登録は止めない（ログに残し、トライアルではない扱いにする）。
 */
export async function findTrialApplicationByInvitation(
  supabase: AdminClient,
  invitationId: string,
  ctx: LogContext,
): Promise<TrialApplicationForRegistration | null> {
  const { data, error } = await supabase
    .from('com_t_trial_application')
    .select('application_id, timezone, last_name, first_name, last_name_latin, first_name_latin')
    .eq('invitation_id', invitationId)
    .maybeSingle();
  if (error) {
    logger.error('trial:find_application_failed', error.message, { ...ctx, err: error, payload: { invitationId } });
    return null;
  }
  return data;
}

/** トライアルのライセンスの期間（本登録の日から WEB_TRIAL_LICENSE_DAYS 日間。日本時間の暦日の 0:00 〜 23:59:59.999） */
export function getWebTrialLicensePeriod(now: Date = new Date()): { startDate: string; endDate: string } {
  const firstDay = toIsoDateInZone(now, REPORTING_TIMEZONE);
  const dayAfterLast = new Date(Date.parse(`${firstDay}T00:00:00Z`) + WEB_TRIAL_LICENSE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  // 終了は「最終日の翌日 0:00 の 1ms 前」（zonedWallClockToUtc はミリ秒を含む時刻を正しく扱えないため、0:00 から引く）
  return {
    startDate: zonedWallClockToUtc(`${firstDay}T00:00:00`, REPORTING_TIMEZONE).toISOString(),
    endDate: new Date(zonedWallClockToUtc(`${dayAfterLast}T00:00:00`, REPORTING_TIMEZONE).getTime() - 1).toISOString(),
  };
}

/**
 * トライアルの本登録を仕上げる（ユーザーの作成後に呼ぶ）。
 * 1. 本登録の月の契約を探す（無ければ作る）→ 本登録の日から14日間のライセンスを発行（ライブ1回のチケットも付く）
 * 2. 申込のタイムゾーンをユーザーに設定する
 * 3. 申込の姓・名（とローマ字）から正式な氏名（com_m_user_legal）を作る
 *    （画面の名前 com_m_user.user_name は招待に入れたローマ字の「名 姓」で、ユーザーの作成時に設定済み）
 * 4. 申込に本登録の日時とユーザーを記録する
 * ライセンスの発行・正式な氏名の登録に失敗しても本登録は失敗させない（招待の本登録と同じ扱い。ログに残し、
 * 管理者が割り当てる・ユーザー管理の「正式氏名」から登録する）。
 */
export async function completeTrialRegistration(
  supabase: AdminClient,
  params: { application: TrialApplicationForRegistration; userId: string },
  ctx: LogContext,
): Promise<void> {
  const { application, userId } = params;
  const { application_id: applicationId, timezone } = application;
  const now = new Date();

  const { data: contractId, error: contractError } = await supabase.rpc('fn_resolve_web_trial_contract', {
    p_at: now.toISOString(),
  });
  if (contractError || !contractId) {
    logger.error('trial:resolve_contract_failed', contractError?.message ?? 'Contract not resolved', {
      ...ctx,
      err: contractError,
      userId,
      payload: { applicationId },
    });
  } else {
    const licenseResult = await issueInitialLicense(
      supabase,
      { contractId, userId, performedBy: null, period: getWebTrialLicensePeriod(now) },
      ctx,
    );
    if (!licenseResult.success) {
      logger.error('trial:issue_license_failed', licenseResult.message, {
        ...ctx,
        userId,
        payload: { applicationId, contractId },
      });
    }
  }

  const { error: timezoneError } = await supabase
    .from('com_m_user')
    .update({ timezone, update_date: now.toISOString() })
    .eq('id', userId);
  if (timezoneError) {
    logger.error('trial:set_timezone_failed', timezoneError.message, {
      ...ctx,
      err: timezoneError,
      userId,
      payload: { applicationId },
    });
  }

  // 新しいユーザーのため行は無い。本人の申告による登録のため登録者（updated_by）は空にする
  const { error: legalError } = await supabase.from('com_m_user_legal').insert({
    user_id: userId,
    last_name: application.last_name,
    first_name: application.first_name,
    last_name_latin: application.last_name_latin,
    first_name_latin: application.first_name_latin,
  });
  if (legalError) {
    logger.error('trial:set_legal_name_failed', legalError.message, {
      ...ctx,
      err: legalError,
      userId,
      payload: { applicationId },
    });
  }

  const { error: applicationError } = await supabase
    .from('com_t_trial_application')
    .update({ user_id: userId, accepted_at: now.toISOString(), update_date: now.toISOString() })
    .eq('application_id', applicationId);
  if (applicationError) {
    logger.error('trial:record_acceptance_failed', applicationError.message, {
      ...ctx,
      err: applicationError,
      userId,
      payload: { applicationId },
    });
  }
}
