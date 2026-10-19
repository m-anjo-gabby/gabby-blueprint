import 'server-only';
import type { LegalName } from '@gabby/types/userLegal';
import { createAdminClient } from '../supabase/admin';

export const LEGAL_NAME_SELECT = 'last_name, first_name, last_name_latin, first_name_latin';

/**
 * 書面（PDF）に載せる正式な氏名を取得する（サーバー専用）。未登録の場合は null。
 * com_m_user_legal はRLSでアドミンと本人しか読めないため、書面の作成では service_role で読む。
 */
export async function fetchLegalName(userId: string): Promise<LegalName | null> {
  const { data } = await createAdminClient()
    .from('com_m_user_legal')
    .select(LEGAL_NAME_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as LegalName | null) ?? null;
}
