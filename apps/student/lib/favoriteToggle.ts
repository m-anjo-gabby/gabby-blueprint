import { createServerClient } from "@gabby/lib/supabase/server";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";
import { FAVORITE_LIMIT_ERROR_CODE, type FavoriteToggleResult } from "@/constants/favorites";

const logger = createLogger('student');

/** お気に入りテーブルと、対象を表す列 */
const FAVORITE_TABLES = {
  content: { table: 'com_t_favorite_contents', column: 'content_id' },
  phrase: { table: 'com_t_favorite_phrase', column: 'phrase_id' },
  sprintQuestion: { table: 'com_t_favorite_sprint_question', column: 'question_id' },
} as const;

export type FavoriteTarget = keyof typeof FAVORITE_TABLES;

/**
 * お気に入りの登録・解除（各 Server Action から呼ぶサーバー専用の共通処理）。
 * 本人の行だけを操作する（RLSでも本人に限定）。登録上限はDBのトリガーで判定し、超過は reason: 'limit' で返す。
 */
export async function toggleFavoriteRow(target: FavoriteTarget, targetId: string, isFavorite: boolean): Promise<FavoriteToggleResult> {
  const ctx = await getLogContext();
  const { table, column } = FAVORITE_TABLES[target];
  const payload = { target, targetId, isFavorite };
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: 'error' };

    const { error } = isFavorite
      ? await supabase
        .from(table)
        .upsert({ user_id: user.id, [column]: targetId }, { onConflict: `user_id,${column}` })
      : await supabase
        .from(table)
        .delete()
        .eq('user_id', user.id)
        .eq(column, targetId);

    if (error) {
      if (error.code === FAVORITE_LIMIT_ERROR_CODE) {
        logger.info("favorite:limit_exceeded", "Favorite limit exceeded", { ...ctx, payload });
        return { ok: false, reason: 'limit' };
      }
      logger.error("favorite:toggle_failed", error.message, { ...ctx, payload });
      return { ok: false, reason: 'error' };
    }

    logger.info("favorite:toggle_success", `Favorite ${isFavorite ? 'added' : 'removed'}`, { ...ctx, payload });
    return { ok: true };
  } catch (err) {
    logger.error("favorite:toggle_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload });
    return { ok: false, reason: 'error' };
  }
}
