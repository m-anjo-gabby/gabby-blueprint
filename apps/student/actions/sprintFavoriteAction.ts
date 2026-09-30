"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";
import { getSprintTitle, resolveSprintHasLevel } from "@gabby/lib";
import type { ContentMetadata } from "@gabby/types/content";
import { FAVORITE_SPRINT_QUESTION_COLUMNS, type FavoriteSprintQuestionFields, type FavoriteSprintQuestionItem } from "@gabby/types/sprint";
import { toggleFavoriteRow } from "@/lib/favoriteToggle";
import { FAVORITE_LIMIT, type FavoriteToggleResult } from "@/constants/favorites";

const logger = createLogger('student');

type FavoriteSprintQuestionRow = {
  favorite_id: string;
  insert_date: string;
  question: FavoriteSprintQuestionFields;
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
      .select(`favorite_id, insert_date, question:com_m_sprint_questions!inner(${FAVORITE_SPRINT_QUESTION_COLUMNS.join(', ')})`)
      .eq('user_id', user.id)
      .order('insert_date', { ascending: false })
      .limit(FAVORITE_LIMIT);

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
      // 汎用／コーパスの判定は問題マスタの sprint_type ではなく教材の設定で行う
      // （コーパススプリントの問題にも sprint_type='0' が入っているため）
      const hasLevel = resolveSprintHasLevel(content.metadata?.sprint);
      return [{
        ...question,
        favorite_id,
        favorited_at: insert_date,
        content_name: content.content_name,
        sprint_title: getSprintTitle(question.question_type, question.difficulty_level, hasLevel),
        has_level: hasLevel,
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
 * スプリント問題のお気に入り状態を切り替える（上限超過・失敗は戻り値で返す）
 */
export async function toggleSprintQuestionFavorite(questionId: string, isFavorite: boolean): Promise<FavoriteToggleResult> {
  return toggleFavoriteRow('sprintQuestion', questionId, isFavorite);
}
