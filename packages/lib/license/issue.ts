/**
 * ライセンス発行の共通処理（サーバー専用）
 *
 * ライセンスの発行経路（契約管理・ユーザー管理のライセンス割当、CSV一括割当、ユーザーの即時作成、
 * 招待からの本登録）のどれを通っても、発行に付随する記録が同じになるようここに集約する。
 *   - 契約のダイアログプラクティス提供有無をライセンスへコピーする
 *   - ライセンスの割当履歴を残す
 *   - ライブセッション付き契約なら、ライセンスに1:1で紐づくチケットを発行する（発行履歴も残す）
 *
 * 💡 'use server' は付けない（外部から直接呼べるエンドポイントにしないため）。
 */
import 'server-only';
import type { createAdminClient } from '../supabase/admin';
import { createLogger, type LogEvent } from '../logger';

const logger = createLogger('common');

type AdminClient = ReturnType<typeof createAdminClient>;
type LogContext = Partial<LogEvent>;

/** ライブセッション付き契約（`com_m_contract.contract_type`） */
const LIVE_SESSION_CONTRACT_TYPE = 2;

// x-user-id ヘッダーが取得できない特殊な文脈（'system'）ではUUID型カラムへの挿入に失敗するため、
// 有効なUUID形式の場合のみ history テーブルの performed_by に設定する
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function resolvePerformedBy(userId?: string): string | null {
  return userId && UUID_PATTERN.test(userId) ? userId : null;
}

export interface LicenseHistoryEntry {
  license_id: string;
  contract_id: string;
  user_id: string;
  action: 'assigned' | 'updated' | 'removed';
  status: number;
  start_date: string;
  end_date: string;
  has_dialogue_practice: boolean;
  note?: string | null;
  performed_by: string | null;
}

/**
 * ライセンスの割当/更新/解除の履歴を記録する（追記専用・失敗しても主処理は継続させる）
 */
export async function recordLicenseHistory(supabase: AdminClient, entry: LicenseHistoryEntry, ctx: LogContext) {
  const { error } = await supabase.from('com_t_user_license_history').insert(entry);
  if (error) {
    // 履歴記録の失敗で本処理（割当/更新/解除）自体を失敗させない。ログにのみ残す。
    logger.error('license:history_record_failed', error.message, { ...ctx, payload: entry });
  }
}

interface TicketHistoryEntry {
  ticket_id: string;
  contract_id: string;
  user_id: string;
  action: 'granted' | 'consumed' | 'restored' | 'removed';
  sessions_delta: number;
  used_sessions_after: number;
  total_sessions: number;
  note?: string | null;
  performed_by: string | null;
}

/**
 * ライブセッションチケットの発行/消化/復元/解除の履歴を記録する（追記専用・失敗しても主処理は継続させる）
 */
async function recordTicketHistory(supabase: AdminClient, entry: TicketHistoryEntry, ctx: LogContext) {
  const { error } = await supabase.from('com_t_user_session_ticket_history').insert(entry);
  if (error) {
    logger.error('license:ticket_history_record_failed', error.message, { ...ctx, payload: entry });
  }
}

/**
 * ライブセッションチケットを1件発行する（ライセンス割当に付随して呼び出す）。
 * チケット発行自体の失敗はライセンス割当を失敗させない（ログにのみ残す）。
 */
async function grantSessionTicket(
  supabase: AdminClient,
  params: {
    license_id: string;
    contract_id: string;
    user_id: string;
    weekly_frequency: number;
    total_sessions: number;
    performed_by: string | null;
  },
  ctx: LogContext
) {
  const { data: ticket, error } = await supabase
    .from('com_t_user_session_ticket')
    .insert({
      license_id: params.license_id,
      contract_id: params.contract_id,
      user_id: params.user_id,
      weekly_frequency: params.weekly_frequency,
      total_sessions: params.total_sessions,
    })
    .select('ticket_id, used_sessions, total_sessions')
    .single();

  if (error || !ticket) {
    logger.error('license:grant_session_ticket_failed', error?.message || 'Ticket insert failed', { ...ctx, payload: params });
    return;
  }

  await recordTicketHistory(supabase, {
    ticket_id: ticket.ticket_id,
    contract_id: params.contract_id,
    user_id: params.user_id,
    action: 'granted',
    sessions_delta: ticket.total_sessions,
    used_sessions_after: ticket.used_sessions,
    total_sessions: ticket.total_sessions,
    performed_by: params.performed_by,
  }, ctx);
}

/** ライセンス発行に必要な契約の項目 */
export interface IssuingContract {
  contract_type: number;
  weekly_frequency: number | null;
  total_sessions: number | null;
  has_dialogue_practice: boolean;
}

/** 発行済み（INSERT済み）のライセンス行 */
export interface IssuedLicenseRow {
  license_id: string;
  user_id: string;
  status: number;
  start_date: string;
  end_date: string;
  note: string | null;
}

/** INSERT 時に返してもらう列（`IssuedLicenseRow` と対応） */
export const ISSUED_LICENSE_COLUMNS = 'license_id, user_id, status, start_date, end_date, note';

/**
 * 発行済みライセンスに付随する記録（割当履歴・ライブのチケット）を作る。
 * ライセンス行の INSERT は呼び出し側で行う（期間・重複・上限の検証が経路ごとに異なるため）。
 * INSERT 時は `has_dialogue_practice` に契約の値を入れること。
 */
export async function recordIssuedLicenses(
  supabase: AdminClient,
  params: {
    contractId: string;
    contract: IssuingContract;
    rows: IssuedLicenseRow[];
    performedBy: string | null;
  },
  ctx: LogContext
) {
  const { contractId, contract, rows, performedBy } = params;

  await Promise.all(rows.map(row => recordLicenseHistory(supabase, {
    license_id: row.license_id,
    contract_id: contractId,
    user_id: row.user_id,
    action: 'assigned',
    status: row.status,
    start_date: row.start_date,
    end_date: row.end_date,
    has_dialogue_practice: contract.has_dialogue_practice,
    note: row.note,
    performed_by: performedBy,
  }, ctx)));

  // ライブセッション付き契約の場合、ライセンスに1:1で紐づくチケットを発行する
  const { weekly_frequency, total_sessions } = contract;
  if (contract.contract_type === LIVE_SESSION_CONTRACT_TYPE && weekly_frequency && total_sessions) {
    await Promise.all(rows.map(row => grantSessionTicket(supabase, {
      license_id: row.license_id,
      contract_id: contractId,
      user_id: row.user_id,
      weekly_frequency,
      total_sessions,
      performed_by: performedBy,
    }, ctx)));
  }
}

/**
 * 契約期間いっぱいの初期ライセンスを発行する（ユーザーの即時作成・招待からの本登録で使う）。
 * 期間・上限の検証は行わない（招待・作成時にアドミンが契約を選んでいるため）。
 */
export async function issueInitialLicense(
  supabase: AdminClient,
  params: { contractId: string; userId: string; performedBy: string | null },
  ctx: LogContext
): Promise<{ success: true } | { success: false; message: string }> {
  const { contractId, userId, performedBy } = params;

  const { data: contract, error: contractError } = await supabase
    .from('com_m_contract')
    .select('start_date, end_date, contract_type, weekly_frequency, total_sessions, has_dialogue_practice')
    .eq('contract_id', contractId)
    .single();

  if (contractError || !contract) {
    return { success: false, message: contractError?.message || 'Contract not found' };
  }

  const { data: inserted, error } = await supabase
    .from('com_t_user_license')
    .insert({
      user_id: userId,
      contract_id: contractId,
      start_date: contract.start_date,
      end_date: contract.end_date,
      status: 1,
      has_dialogue_practice: contract.has_dialogue_practice,
    })
    .select(ISSUED_LICENSE_COLUMNS)
    .single();

  if (error || !inserted) {
    return { success: false, message: error?.message || 'License insert failed' };
  }

  await recordIssuedLicenses(supabase, { contractId, contract, rows: [inserted], performedBy }, ctx);
  return { success: true };
}
