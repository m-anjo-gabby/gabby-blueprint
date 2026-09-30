"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";
import { getSprintTitle, resolveSprintHasLevel } from "@gabby/lib";
import type { ContentMetadata } from "@gabby/types/content";
import type { FavoriteSprintQuestionItem, SprintQuestion } from "@gabby/types/sprint";

const logger = createLogger('student');

type FavoriteSprintQuestionRow = {
  favorite_id: string;
  insert_date: string;
  question: SprintQuestion;
};

type SprintContentRow = {
  content_id: string;
  content_name: string;
  metadata: ContentMetadata | null;
};

/**
 * お気に入りのスプリント問題一覧を取得（新しく登録した順）。
 * 出典の教材が非公開・削除済み・アクセス権なし（RLSで見えない）の問題は除外する。
 */
export async function getFavoriteSprintQuestions(): Promise<FavoriteSprintQuestionItem[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('com_t_favorite_sprint_question')
      .select('favorite_id, insert_date, question:com_m_sprint_questions!inner(*)')
      .eq('user_id', user.id)
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error("sprint:get_favorite_questions_failed", error.message, ctx);
      return [];
    }

    const rows = (data ?? []) as unknown as FavoriteSprintQuestionRow[];
    if (rows.length === 0) return [];

    // 問題マスタは教材への外部キーを持たないため、出典の教材は別に取得する
    const contentIds = Array.from(new Set(rows.map((r) => r.question.content_id)));
    const { data: contents, error: contentError } = await supabase
      .from('com_m_contents')
      .select('content_id, content_name, metadata')
      .in('content_id', contentIds)
      .eq('delete_flg', '0')
      .neq('content_scope', 9);

    if (contentError) {
      logger.error("sprint:get_favorite_question_contents_failed", contentError.message, ctx);
      return [];
    }

    const contentById = new Map((contents as SprintContentRow[]).map((c) => [c.content_id, c]));

    return rows.flatMap(({ favorite_id, insert_date, question }) => {
      const content = contentById.get(question.content_id);
      if (!content) return [];
      return [{
        ...question,
        favorite_id,
        favorited_at: insert_date,
        content_name: content.content_name,
        sprint_title: getSprintTitle(
          question.question_type,
          question.difficulty_level,
          resolveSprintHasLevel(content.metadata?.sprint)
        ),
      }];
    });
  } catch (err) {
    logger.error("sprint:get_favorite_questions_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return [];
  }
}

/**
 * 指定した問題のうち、お気に入り登録済みの問題IDを返す（結果画面の☆の初期表示用）
 */
export async function getFavoriteSprintQuestionIds(questionIds: string[]): Promise<string[]> {
  if (questionIds.length === 0) return [];
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('com_t_favorite_sprint_question')
      .select('question_id')
      .eq('user_id', user.id)
      .in('question_id', questionIds);

    if (error) {
      logger.error("sprint:get_favorite_question_ids_failed", error.message, ctx);
      return [];
    }
    return (data ?? []).map((r) => r.question_id as string);
  } catch (err) {
    logger.error("sprint:get_favorite_question_ids_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return [];
  }
}

/**
 * スプリント問題のお気に入り状態を切り替える（失敗時は例外を投げる）
 */
export async function toggleSprintQuestionFavorite(questionId: string, isFavorite: boolean): Promise<void> {
  const ctx = await getLogContext();
  const payload = { questionId, isFavorite };
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { error } = isFavorite
      ? await supabase
        .from('com_t_favorite_sprint_question')
        .upsert({ user_id: user.id, question_id: questionId }, { onConflict: 'user_id,question_id' })
      : await supabase
        .from('com_t_favorite_sprint_question')
        .delete()
        .match({ user_id: user.id, question_id: questionId });

    if (error) {
      logger.error("sprint:toggle_favorite_question_failed", error.message, { ...ctx, payload });
      throw new Error(error.message);
    }

    logger.info("sprint:toggle_favorite_question_success", `Sprint question favorite ${isFavorite ? 'added' : 'removed'}`, { ...ctx, payload });
  } catch (err) {
    logger.error("sprint:toggle_favorite_question_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload });
    throw err;
  }
}
