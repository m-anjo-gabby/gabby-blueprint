import { unstable_rethrow } from 'next/navigation';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { createServerClient } from '@gabby/lib/supabase/server';
import {
  FAVORITE_LIMIT_ERROR_CODE,
  FAVORITE_LIMIT_MESSAGE,
  FAVORITE_UPDATE_ERROR_MESSAGE,
  type FavoriteToggleResult,
} from '@/constants/favorites';

const logger = createLogger('student');

/** お気に入りの対象（教材・フレーズ・スプリントの問題。表は com_t_favorite_*） */
export type FavoriteTarget = 'content' | 'phrase' | 'sprintQuestion';

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

/**
 * 本人のお気に入りを登録（upsert）・解除（delete）する。
 * 表ごとに対象の列が違うため表ごとに書く（表名・列名を変数にすると列の型検査が効かない）。
 */
function writeFavorite(
  supabase: ServerClient,
  target: FavoriteTarget,
  userId: string,
  targetId: string,
  isFavorite: boolean,
) {
  switch (target) {
    case 'content':
      return isFavorite
        ? supabase
            .from('com_t_favorite_contents')
            .upsert({ user_id: userId, content_id: targetId }, { onConflict: 'user_id,content_id' })
        : supabase.from('com_t_favorite_contents').delete().eq('user_id', userId).eq('content_id', targetId);
    case 'phrase':
      return isFavorite
        ? supabase
            .from('com_t_favorite_phrase')
            .upsert({ user_id: userId, phrase_id: targetId }, { onConflict: 'user_id,phrase_id' })
        : supabase.from('com_t_favorite_phrase').delete().eq('user_id', userId).eq('phrase_id', targetId);
    case 'sprintQuestion':
      return isFavorite
        ? supabase
            .from('com_t_favorite_sprint_question')
            .upsert({ user_id: userId, question_id: targetId }, { onConflict: 'user_id,question_id' })
        : supabase.from('com_t_favorite_sprint_question').delete().eq('user_id', userId).eq('question_id', targetId);
  }
}

/**
 * お気に入りの登録・解除（各 Server Action から呼ぶサーバー専用の共通処理）。
 * 本人の行だけを操作する（RLSでも本人に限定）。登録上限はDBのトリガーで判定し、超過は errorCode: 'limit' で返す。
 */
export async function toggleFavoriteRow(
  target: FavoriteTarget,
  targetId: string,
  isFavorite: boolean,
): Promise<FavoriteToggleResult> {
  const ctx = await getLogContext();
  const payload = { target, targetId, isFavorite };
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, message: FAVORITE_UPDATE_ERROR_MESSAGE };

    const { error } = await writeFavorite(supabase, target, user.id, targetId, isFavorite);

    if (error) {
      if (error.code === FAVORITE_LIMIT_ERROR_CODE) {
        logger.info('favorite:limit_exceeded', 'Favorite limit exceeded', { ...ctx, payload });
        return { success: false, errorCode: 'limit', message: FAVORITE_LIMIT_MESSAGE };
      }
      logger.error('favorite:toggle_failed', error.message, { ...ctx, err: error, payload });
      return { success: false, message: FAVORITE_UPDATE_ERROR_MESSAGE };
    }

    logger.info('favorite:toggle_success', `Favorite ${isFavorite ? 'added' : 'removed'}`, { ...ctx, payload });
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('favorite:toggle_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload,
    });
    return { success: false, message: FAVORITE_UPDATE_ERROR_MESSAGE };
  }
}
