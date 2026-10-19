import 'server-only';
import { cache } from 'react';
import type { TimezoneNames } from '@gabby/types/timezone';
import { createLogger } from '../logger';
import { createAdminClient } from '../supabase/admin';

const logger = createLogger('common');

/**
 * タイムゾーンマスタの名称（IANA名 → 表示名称・短い名前）。リクエスト内で1回だけ取得する。
 * 論理削除した行も、既に設定しているユーザーの表示に使うため含める（管理者権限で読む。名称だけを返す）。
 * 取得に失敗した場合は空（表示は IANA 名で代用される）。
 */
export const getTimezoneNameMap = cache(async (): Promise<Map<string, TimezoneNames>> => {
  const { data, error } = await createAdminClient()
    .from('com_m_timezone')
    .select('timezone, display_name_ja, display_name_en, short_name_ja, short_name_en');
  if (error) {
    logger.error('timezone:get_names_failed', error.message, { err: error });
    return new Map();
  }
  return new Map((data ?? []).map(({ timezone, ...names }) => [timezone as string, names as TimezoneNames]));
});
