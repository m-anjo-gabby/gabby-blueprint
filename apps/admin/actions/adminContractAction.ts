// apps/admin/actions/adminContractAction.ts
'use server';

import { unstable_rethrow } from 'next/navigation';

import { requireAdminRole, SYSTEM_ADMIN_ONLY } from '@/lib/adminAuth';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { formatToJstDate, getUtcRangeFromJstDate } from '@gabby/lib/date/date';
import { revalidatePath } from 'next/cache';
import { isInUseError } from '@gabby/lib/supabase/pgErrors';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { ilikeAny } from '@gabby/lib/supabase/ilike';
import { toRange, type ListParams, type ListResult } from '@/lib/list';
import type { ContractDetail, ContractStatus, ContractType } from '@gabby/types/contract';
import type { TableInsert, TableRow, TableUpdate, ViewRow } from '@gabby/types/db';
import { USER_TYPES } from '@gabby/types/user';
import {
  ISSUED_LICENSE_COLUMNS,
  recordIssuedLicenses,
  recordLicenseHistory,
  resolvePerformedBy,
} from '@gabby/lib/license/issue';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getTranslations } from 'next-intl/server';
import type { ServerTranslator } from '@/i18n/types';
import type { ActionFailure, ActionResult } from '@gabby/types/action';

const logger = createLogger('admin');

/**
 * ライセンス期間が契約期間内に収まっているかを検証する
 * （UI側の「ライセンスの有効期間は契約期間に準じます」という案内と実制御を一致させるため）
 */
function isWithinContractPeriod(
  licenseStartUtc: string,
  licenseEndUtc: string,
  contractStartUtc: string,
  contractEndUtc: string,
): boolean {
  return new Date(licenseStartUtc) >= new Date(contractStartUtc) && new Date(licenseEndUtc) <= new Date(contractEndUtc);
}

/**
 * 同一ユーザーに対して、指定期間と重複するライセンスが既に存在するかを確認する。
 * 生徒に複数ライセンスを付与する運用は「契約更新に伴う次タームへの切替」のみを想定しており、
 * 期間が重なるライセンスの重複付与（＝二重契約状態）を防止するための検証。
 * 停止（status=0）したライセンスは比較対象に含めない（DBの排他制約 excl_user_license_active_overlap と同じ範囲。
 * テナントの付け替え等で停止したライセンスの期間に、別の契約のライセンスを割り当てられるようにするため）。
 * 更新時は自分自身のライセンス（excludeLicenseId）を比較対象から除外する。
 */
async function findOverlappingLicense(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  startUtc: string,
  endUtc: string,
  excludeLicenseId?: string,
): Promise<{ start_date: string; end_date: string; contract_name: string } | null> {
  const t = await getTranslations();
  let query = supabase
    .from('com_t_user_license')
    .select('license_id, start_date, end_date, com_m_contract(contract_name)')
    .eq('user_id', userId)
    .eq('status', 1)
    .lte('start_date', endUtc)
    .gte('end_date', startUtc)
    .limit(1);

  if (excludeLicenseId) {
    query = query.neq('license_id', excludeLicenseId);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;

  const row = data[0];
  return {
    start_date: row.start_date,
    end_date: row.end_date,
    contract_name: row.com_m_contract?.contract_name || t('common.fallback.contract'),
  };
}

function buildOverlapMessage(
  t: ServerTranslator,
  overlap: { start_date: string; end_date: string; contract_name: string },
): string {
  return t('contracts.errors.overlapLicense', {
    contractName: overlap.contract_name,
    start: formatToJstDate(overlap.start_date),
    end: formatToJstDate(overlap.end_date),
  });
}

// com_m_contract (client_id, contract_name) の一意制約違反
const UNIQUE_VIOLATION = '23505';

/**
 * 契約プランマスタの一覧取得（契約登録フォームの選択肢・プランマスタ管理画面の両方で使用）
 */
export async function getContractPlans() {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_contract_plan')
      .select(
        'plan_id, plan_code, plan_name, plan_name_en, contract_type, weekly_frequency, period_months, total_sessions, has_dialogue_practice, sort_no, is_active',
      )
      .order('sort_no', { ascending: true });

    if (error) {
      logger.error('contract:get_contract_plans_failed', error.message, { ...ctx, err: error });
      return [];
    }

    return data || [];
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:get_contract_plans_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
    });
    return [];
  }
}

/**
 * 契約プランの保存（新規・更新。プランマスタ管理画面用）
 * contract_typeはコーチ有無を決める構造的な属性のため、保存後の変更は許可するが
 * （新規プラン作成の代わりに既存プランの位置付けを変える運用は取り得るため）、
 * has_dialogue_practiceとの組み合わせはDB側のCHECK制約(chk_contract_plan_dialogue_requires_coach)
 * で最終的に守られる。
 */
export async function upsertContractPlan(payload: {
  plan_id?: string;
  plan_code: string;
  plan_name: string;
  plan_name_en: string;
  contract_type: ContractType;
  weekly_frequency: number | null;
  period_months: number;
  total_sessions: number | null;
  has_dialogue_practice: boolean;
  sort_no: number;
  is_active: boolean;
}): Promise<ActionResult<{ data: TableRow<'com_m_contract_plan'> }>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const isEdit = !!payload.plan_id;

    const { data, error } = await supabase
      .from('com_m_contract_plan')
      .upsert({
        ...payload,
        update_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error('contract:upsert_contract_plan_failed', error.message, { ...ctx, err: error, payload });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info(
      'contract:upsert_contract_plan_success',
      `Contract plan ${isEdit ? 'updated' : 'created'}: ${data.plan_code}`,
      {
        ...ctx,
        payload: { planId: data.plan_id, isEdit },
      },
    );

    revalidatePath('/contracts/plans');
    revalidatePath('/contracts');
    return { success: true, data };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:upsert_contract_plan_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 契約プランの削除（誤登録の取り消し。プランマスタ管理画面用）
 * 契約で使われているプランは外部キー（RESTRICT）で止まり、販売終了（is_active = false）にするよう案内する。
 */
export async function deleteContractPlan(planId: string): Promise<ActionResult<object, 'in_use'>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('com_m_contract_plan').delete().eq('plan_id', planId);

    if (error) {
      if (isInUseError(error))
        return { success: false, errorCode: 'in_use' as const, message: t('common.errors.unexpected') };
      logger.error('contract:delete_contract_plan_failed', error.message, { ...ctx, err: error, payload: { planId } });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('contract:delete_contract_plan_success', 'Contract plan deleted', { ...ctx, payload: { planId } });

    revalidatePath('/contracts/plans');
    revalidatePath('/contracts');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:delete_contract_plan_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { planId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 契約情報の一覧取得（ページネーション・顧客名/契約名の部分一致検索・顧客での絞り込み）
 */
export async function getContracts(params: ListParams<'clientId'>): Promise<ListResult<ContractDetail>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  const {
    q,
    filters: { clientId },
  } = params;
  try {
    const supabase = await createAdminClient();
    const [from, to] = toRange(params);

    let query = supabase.from('vw_contract_details').select('*', { count: 'exact' });

    if (q) {
      query = query.or(ilikeAny(['client_name', 'contract_name'], q));
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const {
      data: contracts,
      count,
      error,
    } = await query
      .order('insert_date', { ascending: false })
      .order('contract_id', { ascending: true }) // 同順位の並びを一意に固定し、range(LIMIT/OFFSET)でのページ間の重複・欠落を防ぐ
      .range(from, to);

    if (error) {
      logger.error('contract:get_contracts_failed', error.message, {
        ...ctx,
        err: error,
        payload: { from, to, clientId },
      });
      throw new Error(error.message);
    }

    const rows = (contracts || []).map((contract) => ({
      ...contract,
      start_date: contract.start_date ? formatToJstDate(contract.start_date) : '',
      end_date: contract.end_date ? formatToJstDate(contract.end_date) : '',
    })) as ContractDetail[];

    return {
      rows,
      totalCount: count || 0,
    };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:get_contracts_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { clientId },
    });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 特定顧客の「現在有効かつ枠がある」契約一覧を取得
 */
export async function getActiveContractsByClient(clientId: string, userId?: string) {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: contracts, error } = await supabase
      .from('vw_contract_details')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 1)
      .gte('end_date', new Date().toISOString())
      .gt('remaining_licenses', 0)
      .order('contract_name', { ascending: true });

    if (error || !contracts) {
      logger.error('contract:get_active_contracts_failed', error?.message || 'No contracts found', {
        ...ctx,
        err: error,
        payload: { clientId, userId },
      });
      return [];
    }

    if (userId) {
      const { data: userLicenses } = await supabase
        .from('com_t_user_license')
        .select('contract_id, status, start_date, end_date')
        .eq('user_id', userId);

      const licenses = userLicenses || [];
      // 既存ライセンスと契約IDが同じ、または有効なライセンスと期間が重複する契約は選択肢から除外する
      // （生徒への複数ライセンス付与は契約更新に伴う次タームへの切替のみを想定しているため）。
      // 期間の重複は findOverlappingLicense と同じく停止（status=0）したライセンスを含めない。
      const available = contracts.filter(
        (c) =>
          !licenses.some(
            (l) =>
              l.contract_id === c.contract_id ||
              (l.status === 1 &&
                new Date(l.start_date) <= new Date(c.end_date) &&
                new Date(l.end_date) >= new Date(c.start_date)),
          ),
      );
      return formatContracts(available);
    }

    return formatContracts(contracts);
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:get_active_contracts_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { clientId, userId },
    });
    return [];
  }
}

function formatContracts(contracts: ViewRow<'vw_contract_details'>[]) {
  return contracts.map((contract) => ({
    ...contract,
    start_date: contract.start_date ? formatToJstDate(contract.start_date) : '',
    end_date: contract.end_date ? formatToJstDate(contract.end_date) : '',
  }));
}

/**
 * 契約情報の作成
 * contract_typeは選択されたプラン(plan_id)に完全に従属する構造的な属性のため、
 * クライアントからは受け取らずプランマスタから取得する（コーチ有無を変えたい場合は
 * 別プランを選び直す運用とする）。contract_name はアドミン管理用の契約名（顧客内で一意）。
 * plan_name/plan_name_en/weekly_frequency/
 * total_sessions/has_dialogue_practiceはプラン選択時にクライアント側でマスタ値を
 * コピーした上で個別調整できる値のため、送信された値をそのまま保存する。
 */
export async function createContract(params: {
  client_id: string;
  contract_name: string;
  plan_id: string;
  plan_name: string;
  plan_name_en: string;
  max_licenses: number;
  start_date: string;
  end_date: string;
  note?: string | null;
  weekly_frequency?: number | null;
  total_sessions?: number | null;
  has_dialogue_practice: boolean;
}): Promise<ActionResult<{ contract: TableRow<'com_m_contract'> }>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { startUtc, endUtc } = getUtcRangeFromJstDate(params.start_date, params.end_date);

    const { data: plan, error: planError } = await supabase
      .from('com_m_contract_plan')
      .select('contract_type')
      .eq('plan_id', params.plan_id)
      .single();

    if (planError || !plan) {
      logger.error('contract:create_contract_plan_lookup_failed', planError?.message || 'Plan not found', {
        ...ctx,
        err: planError,
        payload: params,
      });
      return { success: false, message: t('contracts.errors.planNotFound') };
    }

    const isLive = plan.contract_type === 2;

    const { data, error } = await supabase
      .from('com_m_contract')
      .insert([
        {
          client_id: params.client_id,
          contract_name: params.contract_name.trim(),
          plan_id: params.plan_id,
          plan_name: params.plan_name,
          plan_name_en: params.plan_name_en,
          max_licenses: params.max_licenses,
          start_date: startUtc,
          end_date: endUtc,
          note: params.note || null,
          status: 1,
          contract_type: plan.contract_type,
          weekly_frequency: isLive ? params.weekly_frequency : null,
          total_sessions: isLive ? params.total_sessions : null,
          has_dialogue_practice: isLive ? params.has_dialogue_practice : false,
        },
      ])
      .select();

    if (error) {
      logger.error('contract:create_contract_failed', error.message, { ...ctx, err: error, payload: params });
      if (error.code === UNIQUE_VIOLATION)
        return { success: false, message: t('contracts.errors.duplicateContractName') };
      return { success: false, message: t('common.errors.unexpected') };
    }

    const newContract = data[0];
    logger.info('contract:create_contract_success', `Contract created for client: ${params.client_id}`, {
      ...ctx,
      payload: { contractId: newContract.contract_id, clientId: params.client_id },
    });

    revalidatePath('/contracts');
    return { success: true, contract: newContract };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:create_contract_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: params,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 契約情報の更新
 */
export async function updateContract(
  contractId: string,
  params: {
    client_id: string;
    contract_name: string;
    plan_id: string;
    plan_name: string;
    plan_name_en: string;
    max_licenses: number;
    start_date: string;
    end_date: string;
    status: ContractStatus;
    note?: string | null;
    weekly_frequency?: number | null;
    total_sessions?: number | null;
    has_dialogue_practice: boolean;
  },
): Promise<ActionResult<{ contract: TableRow<'com_m_contract'> }>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { startUtc, endUtc } = getUtcRangeFromJstDate(params.start_date, params.end_date);

    const { data: plan, error: planError } = await supabase
      .from('com_m_contract_plan')
      .select('contract_type')
      .eq('plan_id', params.plan_id)
      .single();

    if (planError || !plan) {
      logger.error('contract:update_contract_plan_lookup_failed', planError?.message || 'Plan not found', {
        ...ctx,
        err: planError,
        payload: { contractId, ...params },
      });
      return { success: false, message: t('contracts.errors.planNotFound') };
    }

    const isLive = plan.contract_type === 2;

    // 契約期間の短縮・上限数の引き下げが、既存のライセンス発行実績と矛盾しないかを検証する
    // （UI上は「※超過」等の警告表示のみで書き込み自体は防げていなかったため）
    const { data: existingLicenses, error: licensesError } = await supabase
      .from('com_t_user_license')
      .select('license_id, start_date, end_date')
      .eq('contract_id', contractId);

    if (licensesError) {
      logger.error('contract:update_contract_licenses_lookup_failed', licensesError.message, {
        ...ctx,
        err: licensesError,
        payload: { contractId },
      });
      return { success: false, message: t('contracts.errors.licenseCheckFailed') };
    }

    const licenses = existingLicenses || [];

    if (licenses.length > params.max_licenses) {
      return {
        success: false,
        message: t('contracts.errors.maxBelowAssigned', { count: licenses.length }),
      };
    }

    const outOfRangeLicense = licenses.find(
      (l) => new Date(l.start_date) < new Date(startUtc) || new Date(l.end_date) > new Date(endUtc),
    );
    if (outOfRangeLicense) {
      return {
        success: false,
        message: t('contracts.errors.licenseOutsidePeriod'),
      };
    }

    const { data, error } = await supabase
      .from('com_m_contract')
      .update({
        client_id: params.client_id,
        contract_name: params.contract_name.trim(),
        plan_id: params.plan_id,
        plan_name: params.plan_name,
        plan_name_en: params.plan_name_en,
        max_licenses: params.max_licenses,
        start_date: startUtc,
        end_date: endUtc,
        status: params.status,
        note: params.note || null,
        contract_type: plan.contract_type,
        weekly_frequency: isLive ? params.weekly_frequency : null,
        total_sessions: isLive ? params.total_sessions : null,
        has_dialogue_practice: isLive ? params.has_dialogue_practice : false,
        update_date: new Date().toISOString(),
      })
      .eq('contract_id', contractId)
      .select();

    if (error) {
      logger.error('contract:update_contract_failed', error.message, {
        ...ctx,
        err: error,
        payload: { contractId, ...params },
      });
      if (error.code === UNIQUE_VIOLATION)
        return { success: false, message: t('contracts.errors.duplicateContractName') };
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('contract:update_contract_success', `Contract updated`, {
      ...ctx,
      payload: { contractId },
    });

    revalidatePath('/contracts');
    return { success: true, contract: data[0] };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:update_contract_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contractId, ...params },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 契約情報の削除（物理削除）
 * ライセンス発行実績（現在の割当）が一切ない契約に限り削除を許可する。
 * 過去に一度でも割当実績がある契約は、履歴テーブル（com_t_user_license_history等）に
 * 残る外部キー参照により、アプリ側のチェックをすり抜けてもDB制約(23503)で削除が拒否される。
 */
export async function deleteContract(contractId: string): Promise<ActionResult<object, 'has_history'>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { count, error: countError } = await supabase
      .from('com_t_user_license')
      .select('license_id', { count: 'exact', head: true })
      .eq('contract_id', contractId);

    if (countError) {
      logger.error('contract:delete_contract_count_failed', countError.message, {
        ...ctx,
        err: countError,
        payload: { contractId },
      });
      return { success: false, message: t('contracts.errors.contractCheckFailed') };
    }

    if ((count || 0) > 0) {
      return { success: false, message: t('contracts.errors.hasLicenses') };
    }

    const { error } = await supabase.from('com_m_contract').delete().eq('contract_id', contractId);

    if (error) {
      if (error.code === '23503') {
        return {
          success: false,
          message: t('contracts.errors.hasLicenseHistory'),
          errorCode: 'has_history' as const,
        };
      }
      logger.error('contract:delete_contract_failed', error.message, { ...ctx, err: error, payload: { contractId } });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('contract:delete_contract_success', 'Contract deleted', { ...ctx, payload: { contractId } });

    revalidatePath('/contracts');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:delete_contract_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contractId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 契約の完全削除（履歴含む・検証用契約の後片付け専用）
 * 通常の deleteContract とは異なり、割当実績・履歴があっても物理削除する。
 * 監査ログ（誰がいつライセンスを割当/解除したか）ごと復元不能に失われるため、
 * 実運用契約には絶対に使用しないこと。呼び出し元では、通常の削除ボタンとは
 * 別の強い確認UI（対象名の入力等）を経由させる。
 */
export async function purgeContractWithHistory(contractId: string): Promise<ActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    // DB側の履歴は本処理で失われるため、削除前の件数だけはアプリログに残しておく
    const [licenseCount, licenseHistoryCount, ticketHistoryCount] = await Promise.all([
      supabase
        .from('com_t_user_license')
        .select('license_id', { count: 'exact', head: true })
        .eq('contract_id', contractId),
      supabase
        .from('com_t_user_license_history')
        .select('history_id', { count: 'exact', head: true })
        .eq('contract_id', contractId),
      supabase
        .from('com_t_user_session_ticket_history')
        .select('history_id', { count: 'exact', head: true })
        .eq('contract_id', contractId),
    ]);

    logger.warn(
      'contract:purge_contract_with_history_started',
      'Purging contract including assignment/license history (irreversible)',
      {
        ...ctx,
        payload: {
          contractId,
          currentLicenseCount: licenseCount.count || 0,
          licenseHistoryCount: licenseHistoryCount.count || 0,
          ticketHistoryCount: ticketHistoryCount.count || 0,
        },
      },
    );

    const { error } = await supabase.rpc('purge_contract_with_history', { p_contract_id: contractId });

    if (error) {
      logger.error('contract:purge_contract_with_history_failed', error.message, {
        ...ctx,
        err: error,
        payload: { contractId },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.warn('contract:purge_contract_with_history_success', 'Contract purged including history', {
      ...ctx,
      payload: { contractId },
    });

    revalidatePath('/contracts');
    revalidatePath('/users', 'layout');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:purge_contract_with_history_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contractId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ライセンス割当用のユーザーリスト取得
 */
export async function getLicenseAssignmentUsers(contractId: string, clientId: string) {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: allUsers, error: userError } = await supabase
      .schema('private')
      .from('vw_user_list')
      .select('id, user_name, email, license_id')
      .eq('client_id', clientId)
      .eq('user_type', USER_TYPES.STUDENT);

    if (userError) {
      logger.error('contract:get_license_assignment_users_view_failed', userError.message, {
        ...ctx,
        err: userError,
        payload: { contractId, clientId },
      });
      throw new Error('ユーザーデータの取得に失敗しました');
    }

    const { data: currentAssignments, error: assignError } = await supabase
      .from('com_t_user_license')
      .select('user_id, license_id, status')
      .eq('contract_id', contractId);

    if (assignError) {
      logger.error('contract:get_license_assignment_users_assignments_failed', assignError.message, {
        ...ctx,
        err: assignError,
        payload: { contractId, clientId },
      });
      throw new Error('割当情報の取得に失敗しました');
    }

    // vw_user_list.license_idはユーザー単位で「直近の契約に関わらず最も関連性の高い
    // 1件」を返す仕様のため、この契約(contractId)配下の割当かどうかの判定・license_id/
    // statusの表示にはそのまま使わず、必ずこちらの直接クエリ結果を正とする
    const assignmentByUserId = new Map(
      (currentAssignments || []).map((a) => [a.user_id, { license_id: a.license_id, status: a.status }]),
    );

    // ライブセッション付き契約の場合、割当済みユーザーのチケット消化状況を合わせて取得する
    const { data: tickets } = await supabase
      .from('com_t_user_session_ticket')
      .select('user_id, used_sessions, total_sessions')
      .eq('contract_id', contractId);

    const ticketByUserId = new Map(
      (tickets || []).map((t) => [t.user_id, { used_sessions: t.used_sessions, total_sessions: t.total_sessions }]),
    );

    return {
      assignedUsers: (allUsers || [])
        .filter((u) => assignmentByUserId.has(u.id))
        .map((u) => {
          const assignment = assignmentByUserId.get(u.id)!;
          return {
            ...u,
            license_id: assignment.license_id,
            license_status: assignment.status,
            ticket: ticketByUserId.get(u.id) ?? null,
          };
        }),
      unassignedUsers: (allUsers || []).filter((u) => !assignmentByUserId.has(u.id)),
    };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:get_license_assignment_users_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contractId, clientId },
    });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * ライセンスの個別追加
 */
export async function assignLicenseToUser(
  contractId: string,
  userId: string,
  startDateJst: string,
  endDateJst: string,
): Promise<ActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { startUtc, endUtc } = getUtcRangeFromJstDate(startDateJst, endDateJst);

    // 契約期間内に収まっているかを検証（UI表記「ライセンスの有効期間は契約期間に準じます」との整合）
    const { data: contract, error: contractError } = await supabase
      .from('com_m_contract')
      .select(
        'start_date, end_date, contract_type, weekly_frequency, total_sessions, max_licenses, has_dialogue_practice',
      )
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      logger.error('contract:assign_license_contract_lookup_failed', contractError?.message || 'Contract not found', {
        ...ctx,
        err: contractError,
        payload: { contractId },
      });
      return { success: false, message: t('contracts.errors.contractNotFound') };
    }

    if (!isWithinContractPeriod(startUtc, endUtc, contract.start_date, contract.end_date)) {
      return { success: false, message: t('contracts.errors.licenseWithinContract') };
    }

    const overlap = await findOverlappingLicense(supabase, userId, startUtc, endUtc);
    if (overlap) {
      return { success: false, message: buildOverlapMessage(t, overlap) };
    }

    // UI側の上限チェック（isLicenseFull）は表示専用のため、書き込み直前に改めてサーバー側で検証する
    // （複数管理者による同時操作や複数タブでの多重実行時に上限を超過させないため）
    const { count: assignedCount, error: countError } = await supabase
      .from('com_t_user_license')
      .select('license_id', { count: 'exact', head: true })
      .eq('contract_id', contractId);

    if (countError) {
      logger.error('contract:assign_license_count_failed', countError.message, {
        ...ctx,
        err: countError,
        payload: { contractId },
      });
      return { success: false, message: t('contracts.errors.assignmentCheckFailed') };
    }

    if ((assignedCount || 0) >= contract.max_licenses) {
      return { success: false, message: t('contracts.errors.limitReached') };
    }

    const { data: inserted, error } = await supabase
      .from('com_t_user_license')
      .insert({
        contract_id: contractId,
        user_id: userId,
        status: 1,
        start_date: startUtc,
        end_date: endUtc,
        has_dialogue_practice: contract.has_dialogue_practice,
      })
      .select(ISSUED_LICENSE_COLUMNS)
      .single();

    if (error) {
      // 排他制約(DB側の最終防衛線)違反。同時操作によるレースで期間が重なった場合のみ発生し得る
      if (error.code === '23P01') {
        return {
          success: false,
          message: t('contracts.errors.concurrentAssign'),
        };
      }
      logger.error('contract:assign_license_failed', error.message, {
        ...ctx,
        err: error,
        payload: { contractId, userId, startDateJst, endDateJst },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    await recordIssuedLicenses(
      supabase,
      {
        contractId,
        contract,
        rows: [inserted],
        performedBy: resolvePerformedBy(ctx.userId),
      },
      ctx,
    );

    logger.info('contract:assign_license_success', `License assigned to user`, {
      ...ctx,
      payload: { contractId, userId },
    });

    revalidatePath('/contracts');
    revalidatePath('/users', 'layout');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:assign_license_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contractId, userId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ライセンスの無効化（停止）
 * 従来の物理削除（解除）は、ON DELETE CASCADEにより紐づくチケット・スケジュール・
 * 過去の実施済みセッション（call_log/chat/homeworkを含む）まで連鎖して完全に消えてしまう
 * 問題があったため廃止した。本関数はDELETEを一切行わず、invalidate_user_license()
 * （SECURITY DEFINER RPC）を通じて以下の3点をUPDATEするだけに留める。
 *   1. ライセンス自体をstatus=0(停止)にする（チケット消化数はそのまま。返還・復元は
 *      行わない。上限が必要な場合は契約編集でmax_licensesを増やす運用とする）
 *   2. 紐づく稼働中のスケジュールをterminatedにする
 *   3. まだ実施されていない未来のセッションのみキャンセル扱いにする
 * 実施済みのセッション結果・チャット・宿題は一切変更されない。
 * 無効化前の状態を変更履歴（action = invalidated）に残す。
 */
export async function invalidateUserLicense(licenseId: string): Promise<ActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    // 無効化前スナップショット（履歴記録用）
    const { data: existing, error: existingError } = await supabase
      .from('com_t_user_license')
      .select('license_id, contract_id, user_id, status, start_date, end_date, note, has_dialogue_practice')
      .eq('license_id', licenseId)
      .single();

    if (existingError || !existing) {
      logger.error('contract:invalidate_license_lookup_failed', existingError?.message || 'License not found', {
        ...ctx,
        err: existingError,
        payload: { licenseId },
      });
      return { success: false, message: t('contracts.errors.licenseNotFound') };
    }

    const { error } = await supabase.rpc('invalidate_user_license', { p_license_id: licenseId });

    if (error) {
      logger.error('contract:invalidate_license_failed', error.message, { ...ctx, err: error, payload: { licenseId } });
      return { success: false, message: t('common.errors.unexpected') };
    }

    await recordLicenseHistory(
      supabase,
      {
        license_id: existing.license_id,
        contract_id: existing.contract_id,
        user_id: existing.user_id,
        action: 'invalidated',
        status: existing.status,
        start_date: existing.start_date,
        end_date: existing.end_date,
        has_dialogue_practice: existing.has_dialogue_practice,
        note: existing.note,
        performed_by: resolvePerformedBy(ctx.userId),
      },
      ctx,
    );

    logger.info('contract:invalidate_license_success', `License invalidated`, {
      ...ctx,
      payload: { licenseId },
    });

    revalidatePath('/contracts');
    revalidatePath('/users', 'layout');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:invalidate_license_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { licenseId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ライセンス情報の個別更新
 * 【個別対応での契約期間超過を許可 (2026-09-23)】
 * 新規割当(assignLicenseToUser/bulkAssignLicenses)は契約期間内への準拠を維持するが、
 * 本関数（既存ライセンスの編集）に限っては契約期間内チェックを行わない。特定の生徒だけ
 * 何らかの理由で期間延長が必要な個別対応（契約自体の終了日を超える延長を含む）を想定した
 * 意図的な仕様。生徒間の期間重複防止(findOverlappingLicense)は引き続き検証する。
 */
export async function updateUserLicense(
  licenseId: string,
  updates: {
    start_date?: string;
    end_date?: string;
    status?: TableRow<'com_t_user_license'>['status'];
    note?: string | null;
  },
): Promise<ActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    // 更新前スナップショットを取得（履歴記録・契約期間バリデーションの両方に使用）
    const { data: existing, error: existingError } = await supabase
      .from('com_t_user_license')
      .select('license_id, contract_id, user_id, status, start_date, end_date, note, has_dialogue_practice')
      .eq('license_id', licenseId)
      .single();

    if (existingError || !existing) {
      logger.error('contract:update_user_license_lookup_failed', existingError?.message || 'License not found', {
        ...ctx,
        err: existingError,
        payload: { licenseId },
      });
      return { success: false, message: t('contracts.errors.licenseNotFound') };
    }

    const payload: TableUpdate<'com_t_user_license'> = { ...updates };

    if (updates.start_date || updates.end_date) {
      const tempStart = updates.start_date || '2000-01-01';
      const tempEnd = updates.end_date || '2099-12-31';
      const { startUtc, endUtc } = getUtcRangeFromJstDate(tempStart, tempEnd);
      if (updates.start_date) payload.start_date = startUtc;
      if (updates.end_date) payload.end_date = endUtc;
    }

    // 期間が変更される場合の検証。契約期間内チェックはあえて行わない（上記コメント参照）。
    // 生徒間の期間重複防止のみ引き続き検証する。
    const isPeriodChanged = !!(payload.start_date || payload.end_date);
    const effectiveStatus = updates.status ?? existing.status;
    // 停止中のライセンスは重複チェックの対象外のため、有効へ戻す場合も期間の重複を検証する
    const isReactivated = existing.status !== 1 && effectiveStatus === 1;
    if (isPeriodChanged || isReactivated) {
      const effectiveStart = payload.start_date || existing.start_date;
      const effectiveEnd = payload.end_date || existing.end_date;

      if (new Date(effectiveStart) > new Date(effectiveEnd)) {
        return { success: false, message: t('contracts.errors.startAfterEnd') };
      }

      if (effectiveStatus === 1) {
        const overlap = await findOverlappingLicense(
          supabase,
          existing.user_id,
          effectiveStart,
          effectiveEnd,
          licenseId,
        );
        if (overlap) {
          return { success: false, message: buildOverlapMessage(t, overlap) };
        }
      }
    }

    const { error } = await supabase
      .from('com_t_user_license')
      .update({
        ...payload,
        update_date: new Date().toISOString(),
      })
      .eq('license_id', licenseId);

    if (error) {
      // 排他制約(DB側の最終防衛線)違反。同時操作によるレースで期間が重なった場合のみ発生し得る
      if (error.code === '23P01') {
        return {
          success: false,
          message: t('contracts.errors.concurrentUpdate'),
        };
      }
      logger.error('contract:update_user_license_failed', error.message, {
        ...ctx,
        err: error,
        payload: { licenseId, updates },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    // 更新前の状態を履歴として記録（何から何に変わったかは insert_date の並びで追える）
    await recordLicenseHistory(
      supabase,
      {
        license_id: existing.license_id,
        contract_id: existing.contract_id,
        user_id: existing.user_id,
        action: 'updated',
        status: existing.status,
        start_date: existing.start_date,
        end_date: existing.end_date,
        has_dialogue_practice: existing.has_dialogue_practice,
        note: existing.note,
        performed_by: resolvePerformedBy(ctx.userId),
      },
      ctx,
    );

    logger.info('contract:update_user_license_success', `User license updated`, {
      ...ctx,
      payload: { licenseId },
    });

    revalidatePath('/contracts');
    revalidatePath('/users', 'layout');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:update_user_license_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { licenseId, updates },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ライセンスの一括割当
 */
/** 一括割当の結果。期間の重なり・上限で割り当てなかった生徒は、成功・失敗のどちらでも返す */
export type BulkAssignLicensesResult =
  | {
      success: true;
      successCount: number;
      assignedUserIds: string[];
      skippedForOverlap: string[];
      skippedForCapacity: string[];
    }
  | (ActionFailure & { errorCount: number; skippedForOverlap?: string[]; skippedForCapacity?: string[] });

export async function bulkAssignLicenses(
  contractId: string,
  userIds: string[],
  startDateJst: string,
  endDateJst: string,
): Promise<BulkAssignLicensesResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { startUtc, endUtc } = getUtcRangeFromJstDate(startDateJst, endDateJst);

    // 契約期間内に収まっているかを検証（個別割当と同じ制御を一括割当にも適用）
    const { data: contract, error: contractError } = await supabase
      .from('com_m_contract')
      .select(
        'start_date, end_date, contract_type, weekly_frequency, total_sessions, max_licenses, has_dialogue_practice',
      )
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      logger.error(
        'contract:bulk_assign_licenses_contract_lookup_failed',
        contractError?.message || 'Contract not found',
        { ...ctx, err: contractError, payload: { contractId } },
      );
      return { success: false, message: t('contracts.errors.contractNotFound'), errorCount: userIds.length };
    }

    if (!isWithinContractPeriod(startUtc, endUtc, contract.start_date, contract.end_date)) {
      return { success: false, message: t('contracts.errors.licenseWithinContract'), errorCount: userIds.length };
    }

    // 期間が重複する既存ライセンスを持つユーザーは対象から除外する
    const overlapResults = await Promise.all(
      userIds.map(async (userId) => ({
        userId,
        overlap: await findOverlappingLicense(supabase, userId, startUtc, endUtc),
      })),
    );
    const skippedForOverlap = overlapResults.filter((r) => r.overlap).map((r) => r.userId);
    let targetUserIds = overlapResults.filter((r) => !r.overlap).map((r) => r.userId);

    if (targetUserIds.length === 0) {
      return {
        success: false,
        message: t('contracts.errors.allUsersOverlap'),
        errorCount: userIds.length,
        skippedForOverlap,
      };
    }

    // UI側の上限チェックは表示専用のため、書き込み直前に改めてサーバー側で上限を検証する
    const { count: assignedCount, error: countError } = await supabase
      .from('com_t_user_license')
      .select('license_id', { count: 'exact', head: true })
      .eq('contract_id', contractId);

    if (countError) {
      logger.error('contract:bulk_assign_licenses_count_failed', countError.message, {
        ...ctx,
        err: countError,
        payload: { contractId },
      });
      return { success: false, message: t('contracts.errors.assignmentCheckFailed'), errorCount: userIds.length };
    }

    const remainingSlots = Math.max(contract.max_licenses - (assignedCount || 0), 0);
    const skippedForCapacity = targetUserIds.slice(remainingSlots);
    targetUserIds = targetUserIds.slice(0, remainingSlots);

    if (targetUserIds.length === 0) {
      return {
        success: false,
        message: t('contracts.errors.limitReached'),
        errorCount: userIds.length,
        skippedForOverlap,
        skippedForCapacity,
      };
    }

    const insertData: TableInsert<'com_t_user_license'>[] = targetUserIds.map((userId) => ({
      contract_id: contractId,
      user_id: userId,
      status: 1,
      start_date: startUtc,
      end_date: endUtc,
      has_dialogue_practice: contract.has_dialogue_practice,
    }));

    const { data, error } = await supabase.from('com_t_user_license').insert(insertData).select(ISSUED_LICENSE_COLUMNS);

    if (error) {
      // 排他制約(DB側の最終防衛線)違反。同時操作によるレースで期間が重なった場合のみ発生し得る
      // （1件でも重なれば複数行INSERT全体が失敗するため、対象を見直した上での再実行を促す）
      if (error.code === '23P01') {
        return {
          success: false,
          message: t('contracts.errors.concurrentBulkAssign'),
          errorCount: userIds.length,
        };
      }
      logger.error('contract:bulk_assign_licenses_failed', error.message, {
        ...ctx,
        err: error,
        payload: { contractId, userIds, startDateJst, endDateJst },
      });
      return { success: false, message: t('common.errors.unexpected'), errorCount: userIds.length };
    }

    await recordIssuedLicenses(
      supabase,
      {
        contractId,
        contract,
        rows: data || [],
        performedBy: resolvePerformedBy(ctx.userId),
      },
      ctx,
    );

    logger.info('contract:bulk_assign_licenses_success', `Bulk licenses assigned`, {
      ...ctx,
      payload: { contractId, count: data?.length || 0 },
    });

    revalidatePath('/users', 'layout');
    revalidatePath('/contracts');

    return {
      success: true,
      successCount: data?.length || 0,
      assignedUserIds: (data || []).map((d) => d.user_id),
      skippedForOverlap,
      skippedForCapacity,
    };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:bulk_assign_licenses_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contractId, userIds },
    });
    return { success: false, message: t('common.errors.unexpected'), errorCount: userIds.length };
  }
}

/**
 * ユーザーのライセンス履歴
 */
export async function getLicenseTimeline(userId: string) {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_t_user_license')
      .select(
        `
        *,
        com_m_contract (contract_name, plan_name)
      `,
      )
      .eq('user_id', userId)
      .order('start_date', { ascending: false });

    if (error) {
      logger.error('contract:get_license_timeline_failed', error.message, { ...ctx, err: error, payload: { userId } });
      throw error;
    }

    // 解除済み（物理削除済み）のライセンスは履歴テーブル側から補完し、
    // 「解除すると履歴が消える」問題を解消する。現行のライセンス一覧の並び・形状には影響しない。
    const { data: removedHistory, error: historyError } = await supabase
      .from('com_t_user_license_history')
      .select(
        `
        license_id,
        contract_id,
        status,
        start_date,
        end_date,
        note,
        performed_at,
        com_m_contract (contract_name, plan_name)
      `,
      )
      .eq('user_id', userId)
      .eq('action', 'removed')
      .order('performed_at', { ascending: false });

    if (historyError) {
      logger.error('contract:get_license_removed_history_failed', historyError.message, {
        ...ctx,
        err: historyError,
        payload: { userId },
      });
    }

    const liveLicenses = (data || []).map((l) => ({
      ...l,
      is_removed: false,
      start_date: formatToJstDate(l.start_date),
      end_date: formatToJstDate(l.end_date),
      contract_name: l.com_m_contract?.contract_name || t('common.fallback.contract'),
      plan_name: l.com_m_contract?.plan_name || t('common.fallback.plan'),
    }));

    const removedLicenses = (removedHistory || []).map((h) => ({
      license_id: h.license_id,
      contract_id: h.contract_id,
      status: h.status,
      note: h.note,
      is_removed: true,
      removed_at: h.performed_at,
      start_date: formatToJstDate(h.start_date),
      end_date: formatToJstDate(h.end_date),
      contract_name: h.com_m_contract?.contract_name || t('common.fallback.contract'),
      plan_name: h.com_m_contract?.plan_name || t('common.fallback.plan'),
    }));

    return [...liveLicenses, ...removedLicenses];
  } catch (error) {
    unstable_rethrow(error);
    logger.error('contract:get_license_timeline_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { userId },
    });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}
