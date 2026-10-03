import 'server-only';
import { cache } from 'react';
import { createServerClient } from '@gabby/lib/supabase/server';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { toIsoMonthInZone } from '@gabby/lib/date/date';

const DEFAULT_TIMEZONE = 'Asia/Tokyo';

/**
 * ログイン中の生徒のタイムゾーン（プロフィールの設定。未設定・取得失敗時は Asia/Tokyo）。
 * 実績は生徒のタイムゾーンでの実施日で数えるため、月の範囲や「今月」の判定に使う。リクエスト内で1回にまとめる。
 */
export const getMyTimezone = cache(async (): Promise<string> => {
  try {
    const user = await getAuthUser();
    if (!user) return DEFAULT_TIMEZONE;
    const supabase = await createServerClient();
    const { data } = await supabase.from('com_m_user').select('timezone').eq('id', user.id).single();
    return data?.timezone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
});

/** URLの `?month=`（YYYY-MM）があればそれを、無ければ生徒のタイムゾーンでの今月を返す */
export async function resolveTargetMonth(month: string | undefined): Promise<string> {
  return month || toIsoMonthInZone(new Date(), await getMyTimezone());
}
