import 'server-only';
import { cache } from 'react';
import { createLogger } from '../logger';
import { type AuthUser } from '../supabase/authUser';
import { createServerClient } from '../supabase/server';

const logger = createLogger('common');

export const DEFAULT_VIEWER_TIMEZONE = 'Asia/Tokyo';

/** シェル（ヘッダー・日時の表示）が使うログイン中の利用者のプロフィール */
export interface ViewerProfile {
  user_id: number;
  user_name: string;
  icon_path: string | null;
  locale_id: string;
  timezone: string;
}

/**
 * ログイン中の利用者のプロフィールをサーバーで取得する（各アプリの `(app)/layout.tsx` 用）。
 * 日時はサーバーの描画の時点から利用者のタイムゾーンで出す必要があり、ブラウザで取得すると
 * 取得までの間だけ日本時間で描かれて表示が切り替わるため、レイアウトで取得して渡す。
 * 取得に失敗しても画面は出すため、メールアドレスの前半と日本時間で埋める。
 */
export const loadViewerProfile = cache(async (user: AuthUser): Promise<ViewerProfile> => {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('com_m_user')
    .select('user_id, user_name, icon_path, locale_id, timezone')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    logger.error('auth:get_profile_failed', error?.message ?? 'Profile not found', { err: error, userId: user.id });
    return {
      user_id: 0,
      user_name: user.email?.split('@')[0] ?? '',
      icon_path: null,
      locale_id: 'ja',
      timezone: DEFAULT_VIEWER_TIMEZONE,
    };
  }

  return {
    user_id: data.user_id,
    user_name: data.user_name ?? '',
    icon_path: data.icon_path,
    locale_id: data.locale_id ?? 'ja',
    timezone: data.timezone || DEFAULT_VIEWER_TIMEZONE,
  };
});
