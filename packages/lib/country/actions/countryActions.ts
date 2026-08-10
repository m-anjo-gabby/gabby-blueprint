'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger, getLogContext } from '../../logger';
import { GetCountryListResult } from '@gabby/types/country';

const logger = createLogger('common');

/**
 * 国籍マスタの選択肢一覧を取得する（ポータル共通、認証済みユーザーであれば取得可能）
 */
export async function getCountryListCore(): Promise<GetCountryListResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('com_m_country')
      .select('*')
      .eq('delete_flg', '0')
      .order('sort_no', { ascending: true });

    if (error) {
      logger.error('country:get_country_list_failed', error.message, ctx);
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, countries: data ?? [] };
  } catch (err) {
    logger.error('country:get_country_list_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
