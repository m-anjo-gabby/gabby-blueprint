'use server';

import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { createServerClient } from '@gabby/lib/supabase/server';
import { LEGAL_NAME_SELECT } from '@gabby/lib/userLegal/fetchLegalName';
import { LEGAL_NAME_MAX_LENGTH, type LegalName } from '@gabby/types/userLegal';
import { requireAdminRole, SYSTEM_ADMIN_ONLY } from '@/lib/adminAuth';

const logger = createLogger('admin');

export type GetUserLegalNameResult = { success: true; legalName: LegalName | null } | { success: false };

export type SaveUserLegalNameResult = { success: true; legalName: LegalName | null } | { success: false };

/** 空欄は null（未入力）として扱う */
const optionalName = z
  .string()
  .trim()
  .max(LEGAL_NAME_MAX_LENGTH)
  .transform((v) => v || null);

const saveUserLegalNameInput = z
  .object({
    userId: z.uuid(),
    last_name: optionalName,
    first_name: optionalName,
    last_name_latin: optionalName,
    first_name_latin: optionalName,
  })
  .refine((v) => !v.last_name || v.first_name, { path: ['first_name'] })
  .refine((v) => !v.last_name_latin || v.first_name_latin, { path: ['first_name_latin'] })
  .refine((v) => !v.first_name_latin || v.first_name, { path: ['first_name'] });

/**
 * ユーザーの正式な氏名を取得する（正式氏名ダイアログ用）。未登録の場合は legalName = null。
 * RLS でアドミンだけが他人の行を読めるため、ログイン中のクライアントで読む。
 */
export async function getUserLegalName(userId: string): Promise<GetUserLegalNameResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  if (!z.uuid().safeParse(userId).success) return { success: false };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('com_m_user_legal')
    .select(LEGAL_NAME_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.error('user_legal:get_failed', error.message, { ...ctx, err: error, payload: { userId } });
    return { success: false };
  }
  return { success: true, legalName: (data as LegalName | null) ?? null };
}

/**
 * ユーザーの正式な氏名を登録・変更する。すべて空欄の場合は登録を消して未登録に戻す。
 * 単一テーブルの更新のため RPC にはせず、RLS（アドミンのみ）で守られたログイン中のクライアントで書く。
 */
export async function saveUserLegalName(input: {
  userId: string;
  last_name: string;
  first_name: string;
  last_name_latin: string;
  first_name_latin: string;
}): Promise<SaveUserLegalNameResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  const parsed = saveUserLegalNameInput.safeParse(input);
  if (!parsed.success) return { success: false };
  const { userId, ...name } = parsed.data;

  try {
    const supabase = await createServerClient();

    if (!name.first_name) {
      const { error } = await supabase.from('com_m_user_legal').delete().eq('user_id', userId);
      if (error) {
        logger.error('user_legal:delete_failed', error.message, { ...ctx, err: error, payload: { userId } });
        return { success: false };
      }
      logger.info('user_legal:delete_success', 'User legal name cleared', { ...ctx, payload: { userId } });
      return { success: true, legalName: null };
    }

    const admin = await getAuthUser();
    const legalName: LegalName = { ...name, first_name: name.first_name };
    const { error } = await supabase.from('com_m_user_legal').upsert(
      {
        user_id: userId,
        ...legalName,
        updated_by: admin?.id ?? null,
        update_date: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      logger.error('user_legal:save_failed', error.message, { ...ctx, err: error, payload: { userId } });
      return { success: false };
    }

    // 氏名は個人情報のため、ログには対象のユーザーIDだけを残す
    logger.info('user_legal:save_success', 'User legal name saved', { ...ctx, payload: { userId } });
    return { success: true, legalName };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('user_legal:save_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { userId },
    });
    return { success: false };
  }
}
