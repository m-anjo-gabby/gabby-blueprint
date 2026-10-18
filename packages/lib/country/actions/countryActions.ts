'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { type GetCountryListResult } from '@gabby/types/country';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';

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
      .eq('is_active', true)
      .order('sort_no', { ascending: true });

    if (error) {
      logger.error('country:get_country_list_failed', error.message, { ...ctx, err: error });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, countries: data ?? [] };
  } catch (err) {
    logger.error('country:get_country_list_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}
