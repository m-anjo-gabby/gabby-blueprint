'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger, getLogContext } from '../../logger';
import { GetMyProfileResult } from '@gabby/types/profile';

const logger = createLogger('common');

/**
 * ログイン中ユーザー自身のプロフィール情報を取得する（ポータル共通）
 * 名前・所属（顧客名）・アイコンパスなど、全ポータルで共通の最小セットを返す。
 * ポータル固有の追加項目は、呼び出し側（各アプリのProfileAction）で別途取得・合成すること。
 */
export async function getMyProfileCore(): Promise<GetMyProfileResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, errorCode: 'unauthorized' };
    }

    const { data, error } = await supabase
      .from('com_m_user')
      .select('id, user_id, user_name, user_type, icon_path, client_id, com_m_client(client_name)')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      logger.error('profile:get_my_profile_failed', error?.message || 'Profile not found', {
        ...ctx,
        userId: user.id,
      });
      return { success: false, errorCode: 'not_found' };
    }

    const client = data.com_m_client as unknown as { client_name: string } | null;

    return {
      success: true,
      profile: {
        id: data.id,
        user_id: data.user_id,
        user_name: data.user_name,
        user_type: data.user_type,
        icon_path: data.icon_path,
        client_id: data.client_id,
        client_name: client?.client_name ?? null,
      },
    };
  } catch (err) {
    logger.error('profile:get_my_profile_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
