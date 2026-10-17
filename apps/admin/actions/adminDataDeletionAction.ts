'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { removeStorageFiles } from '@gabby/lib/storage/removeStorageFiles';
import { USER_STATUS } from '@gabby/types/user';

// 停止・退会・顧客単位の一括削除（規約は docs/DATA-DELETION.md）。
// 退会・一括削除は戻せないため、システム管理者（admin ロール）だけが実行でき、対象の名前の入力で確認する。

const logger = createLogger('admin');

/** 停止中は認証のアカウントを無期限に止める（Supabase Auth の ban。再開で 'none' に戻す） */
const SUSPEND_BAN_DURATION = '876000h';

/** RPC が例外のメッセージで返す中断の理由（fn_withdraw_user / fn_purge_client） */
const WITHDRAW_BLOCKERS = ['user_not_found', 'not_withdrawable', 'active_license', 'scheduled_session', 'active_matching'] as const;
const PURGE_BLOCKERS = ['client_not_found', 'protected_client', 'has_admin', 'linked_to_other_client'] as const;

export type WithdrawBlocker = (typeof WITHDRAW_BLOCKERS)[number];
export type PurgeBlocker = (typeof PURGE_BLOCKERS)[number];

export type DataDeletionResult<E extends string> =
  | { success: true }
  | { success: false; errorCode: E | 'forbidden' | 'name_mismatch' | 'unexpected_error' };

/** 顧客単位の一括削除で消える件数（fn_purge_client の counts） */
export interface PurgeClientCounts {
  students: number;
  coaches: number;
  invitations: number;
  contracts: number;
  licenses: number;
  sessions: number;
  trainings: number;
  chat_messages: number;
  notices: number;
  calendar_events: number;
}

interface StoragePaths {
  profile?: string[];
  homework?: string[];
  chat?: string[];
}

/** システム管理者（admin ロール）か */
async function requireSystemAdmin(): Promise<string | null> {
  const user = await getAuthUser();
  const roles = user?.app_metadata?.roles;
  return user && Array.isArray(roles) && roles.includes('admin') ? user.id : null;
}

function pickBlocker<T extends readonly string[]>(message: string | undefined, codes: T): T[number] | null {
  return codes.find((code) => message?.includes(code)) ?? null;
}

/** Storage のファイルを消す（失敗してもエラーのログだけ残して続ける。DB の消去は済んでいるため） */
async function removeDeletedFiles(paths: StoragePaths, ctx: Awaited<ReturnType<typeof getLogContext>>, payload: Record<string, unknown>) {
  const supabase = createAdminClient();
  for (const [bucket, list] of Object.entries(paths) as [keyof StoragePaths, string[] | undefined][]) {
    await removeStorageFiles(supabase, bucket, list ?? [], { event: 'dataDeletion:delete_files_failed', ctx, payload });
  }
}

/** 認証のアカウントを消す（既に無い場合は成功扱い） */
async function deleteAuthUser(userId: string, ctx: Awaited<ReturnType<typeof getLogContext>>): Promise<boolean> {
  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error && error.status !== 404) {
    logger.error('dataDeletion:delete_auth_user_failed', error.message, { ...ctx, err: error, payload: { userId } });
    return false;
  }
  return true;
}

/**
 * ユーザーの停止・再開。停止中はログインできない（認証のアカウントを止め、com_m_user.status = 0 にする）。
 * 退会済みのユーザーは対象外。
 */
export async function setUserSuspended(userId: string, suspended: boolean): Promise<DataDeletionResult<'user_not_found' | 'withdrawn'>> {
  const ctx = await getLogContext();
  try {
    if (!(await requireSystemAdmin())) return { success: false, errorCode: 'forbidden' };
    const supabase = createAdminClient();

    const { data: user, error: fetchError } = await supabase.from('com_m_user').select('status').eq('id', userId).maybeSingle();
    if (fetchError) throw fetchError;
    if (!user) return { success: false, errorCode: 'user_not_found' };
    if (user.status === USER_STATUS.WITHDRAWN) return { success: false, errorCode: 'withdrawn' };

    const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: suspended ? SUSPEND_BAN_DURATION : 'none',
    });
    if (banError) throw banError;

    const { error } = await supabase
      .from('com_m_user')
      .update({ status: suspended ? USER_STATUS.SUSPENDED : USER_STATUS.ACTIVE, update_date: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;

    logger.info(suspended ? 'user:suspend_success' : 'user:resume_success', `User ${suspended ? 'suspended' : 'resumed'}`, { ...ctx, payload: { userId } });
    revalidatePath('/users', 'layout');
    return { success: true };
  } catch (err) {
    logger.error(suspended ? 'user:suspend_unexpected' : 'user:resume_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err, payload: { userId } });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 退会（個人情報の消去）。confirmName は画面で入力させた対象の表示名（取り違えの防止）。
 * DB の消去（fn_withdraw_user）→ Storage のファイル → 認証のアカウントの順に消す。途中で失敗しても再実行で続きから終わる。
 */
export async function withdrawUser(userId: string, confirmName: string): Promise<DataDeletionResult<WithdrawBlocker>> {
  const ctx = await getLogContext();
  try {
    const adminId = await requireSystemAdmin();
    if (!adminId) return { success: false, errorCode: 'forbidden' };
    const supabase = createAdminClient();

    const { data: user, error: fetchError } = await supabase.from('com_m_user').select('user_name, status').eq('id', userId).maybeSingle();
    if (fetchError) throw fetchError;
    if (!user) return { success: false, errorCode: 'user_not_found' };
    // 退会済み（途中で失敗した再実行）は表示名が置き換わっているため、名前の照合をしない
    if (user.status !== USER_STATUS.WITHDRAWN && (user.user_name ?? '').trim() !== confirmName.trim()) {
      return { success: false, errorCode: 'name_mismatch' };
    }

    const { data, error } = await supabase.rpc('fn_withdraw_user', { p_user_id: userId, p_performed_by: adminId });
    if (error) {
      const blocker = pickBlocker(error.message, WITHDRAW_BLOCKERS);
      if (blocker) return { success: false, errorCode: blocker };
      throw error;
    }

    const result = data as { storage?: StoragePaths; counts?: Record<string, number> } | null;
    await removeDeletedFiles(result?.storage ?? {}, ctx, { userId });
    if (!(await deleteAuthUser(userId, ctx))) return { success: false, errorCode: 'unexpected_error' };

    logger.info('user:withdraw_success', 'User withdrawn (personal data erased)', { ...ctx, payload: { userId, counts: result?.counts } });
    revalidatePath('/users', 'layout');
    return { success: true };
  } catch (err) {
    logger.error('user:withdraw_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err, payload: { userId } });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/** 顧客単位の一括削除の予行（消える件数。何も消さない） */
export async function previewPurgeClient(
  clientId: string
): Promise<{ success: true; counts: PurgeClientCounts } | { success: false; errorCode: PurgeBlocker | 'forbidden' | 'unexpected_error' }> {
  const ctx = await getLogContext();
  try {
    const adminId = await requireSystemAdmin();
    if (!adminId) return { success: false, errorCode: 'forbidden' };
    const { data, error } = await createAdminClient().rpc('fn_purge_client', { p_client_id: clientId, p_dry_run: true, p_performed_by: adminId });
    if (error) {
      const blocker = pickBlocker(error.message, PURGE_BLOCKERS);
      if (blocker) return { success: false, errorCode: blocker };
      throw error;
    }
    return { success: true, counts: (data as { counts: PurgeClientCounts }).counts };
  } catch (err) {
    logger.error('client:purge_preview_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err, payload: { clientId } });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 顧客単位の一括削除（戻せない）。confirmName は画面で入力させた顧客名。
 * DB の削除（fn_purge_client）→ Storage のファイル → 所属していたユーザーの認証のアカウントの順に消す。
 */
export async function purgeClient(clientId: string, confirmName: string): Promise<DataDeletionResult<PurgeBlocker>> {
  const ctx = await getLogContext();
  try {
    const adminId = await requireSystemAdmin();
    if (!adminId) return { success: false, errorCode: 'forbidden' };
    const supabase = createAdminClient();

    const { data: client, error: fetchError } = await supabase.from('com_m_client').select('client_name').eq('client_id', clientId).maybeSingle();
    if (fetchError) throw fetchError;
    if (!client) return { success: false, errorCode: 'client_not_found' };
    if (client.client_name.trim() !== confirmName.trim()) return { success: false, errorCode: 'name_mismatch' };

    const { data, error } = await supabase.rpc('fn_purge_client', { p_client_id: clientId, p_dry_run: false, p_performed_by: adminId });
    if (error) {
      const blocker = pickBlocker(error.message, PURGE_BLOCKERS);
      if (blocker) return { success: false, errorCode: blocker };
      throw error;
    }

    const result = data as { user_ids?: string[]; storage?: StoragePaths; counts?: PurgeClientCounts };
    await removeDeletedFiles(result.storage ?? {}, ctx, { clientId });
    // 顧客の行は消えているため、認証のアカウントの削除に失敗した分は記録だけ残す（ログインしても所属の無い状態になる）
    for (const userId of result.user_ids ?? []) {
      await deleteAuthUser(userId, ctx);
    }

    logger.info('client:purge_success', 'Client purged', { ...ctx, payload: { clientId, counts: result.counts } });
    revalidatePath('/clients');
    revalidatePath('/users');
    revalidatePath('/contracts');
    return { success: true };
  } catch (err) {
    logger.error('client:purge_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err, payload: { clientId } });
    return { success: false, errorCode: 'unexpected_error' };
  }
}
