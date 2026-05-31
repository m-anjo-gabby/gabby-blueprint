'use server';

import { createServerClient } from "@gabby/lib/supabase/server";
import { SprintQuestion, SprintQuestionResponse } from "@gabby/types/sprint";
import { createLogger, getLogContext } from "@gabby/lib/logger";

const logger = createLogger("student");
const SPRINT_LIMIT_COUNT = 10;

// ========================================================================
// 📊 型定義（Types）
// ========================================================================

/**
 * 出題順序やグループ構造を完全再現するための履歴オブジェクト型
 */
export interface SprintHistoryItem {
  question_id: string;
  group_id: string | null;
  seq_no: number;
}

/**
 * 自主トレスプリント結果登録用の入力ペイロード型
 */
export interface CreateSprintScoreInput {
  question_type: '0' | '4' | '5' | '6';
  answer_type: string;
  difficulty_level: number;
  time_limit_sec: number;
  total_answered: number;
  history: SprintHistoryItem[]; // answered_historyに入る配列オブジェクト
}

/**
 * スプリント結果取得のレスポンス型
 */
export interface SprintResultResponse {
  success: boolean;
  data: {
    scoreRecord: {
      self_sprint_id: string;
      user_id: string;
      question_type: string;
      answer_type: string;
      difficulty_level: number;
      time_limit_sec: number;
      total_answered: number;
      answered_history: SprintHistoryItem[];
      insert_date: string;
      update_date: string;
    };
    questions: SprintQuestion[]; // 当時の出題順に完璧にソートされた問題エンティティ配列
  } | null;
  error?: string;
}

// ========================================================================
// 🛠️ ユーティリティ・ヘルパー
// ========================================================================

/**
 * Fisher-Yatesシャッフル（メモリ上での軽量高速サンプリング）
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ========================================================================
// 🚀 Server Actions
// ========================================================================

/**
 * スプリント教材データをフェッチ・サンプリングするServer Action
 */
export async function getSprintQuestionsAction(
  question_type: '0' | '4' | '5' | '6',
  difficulty_level: number,
  mode: 'sprint' | 'drill' = 'sprint'
): Promise<SprintQuestionResponse> {
  const ctx = await getLogContext();
  
  logger.info("sprint:fetch_start", "getSprintQuestionsAction start", {
    ...ctx,
    payload: { question_type, difficulty_level, mode }
  });

  try {
    const supabase = await createServerClient();

    const safeType = String(question_type).trim();
    const safeLevel = Number(difficulty_level);

    const { data: fetchedData, error } = await supabase
      .from("com_m_sprint_questions")
      .select("*")
      .eq("question_type", safeType)
      .eq("difficulty_level", safeLevel)
      .eq("delete_flg", "0");

    if (error) throw error;

    const rawRows = (fetchedData as SprintQuestion[]) ?? [];

    if (rawRows.length === 0) {
      logger.info("sprint:fetch_empty", "No questions found at all for this type/level", ctx);
      return { success: true, data: [] };
    }

    let finalData: SprintQuestion[] = [];

    if (safeType === "0") {
      if (mode === 'sprint') {
        finalData = shuffleArray(rawRows).slice(0, SPRINT_LIMIT_COUNT);
      } else {
        finalData = shuffleArray(rawRows);
      }
    } 
    else {
      if (mode === 'sprint') {
        const allUniqueGroupIds = Array.from(new Set(rawRows.map(item => item.group_id).filter(Boolean)));
        const sampledGroupIds = shuffleArray(allUniqueGroupIds).slice(0, SPRINT_LIMIT_COUNT);

        finalData = rawRows
          .filter(item => sampledGroupIds.includes(item.group_id))
          .sort((a, b) => {
            if (a.group_id! < b.group_id!) return -1;
            if (a.group_id! > b.group_id!) return 1;
            return (a.seq_no || 0) - (b.seq_no || 0);
          });
      } else {
        finalData = [...rawRows].sort((a, b) => {
          if (a.group_id! < b.group_id!) return -1;
          if (a.group_id! > b.group_id!) return 1;
          return (a.seq_no || 0) - (b.seq_no || 0);
        });
      }
    }

    logger.info("sprint:fetch_success", "getSprintQuestionsAction success", {
      ...ctx,
      payload: { mode, count: finalData.length }
    });
    
    return { success: true, data: finalData };

  } catch (error: any) {
    logger.error("sprint:fetch_error", "getSprintQuestionsAction error", {
      ...ctx,
      payload: { error: error.message }
    });

    return {
      success: false,
      data: null,
      error: error.message || "Failed to fetch sprint questions"
    };
  }
}

/**
 * 自主トレスプリント結果・履歴をDBに登録するServer Action
 */
export async function createSprintScoreAction(
  input: CreateSprintScoreInput
): Promise<{ success: boolean; data: { self_sprint_id: string } | null; error?: string }> {
  const ctx = await getLogContext();
  logger.info("sprint:create_score_start", "createSprintScoreAction start", { 
    ...ctx, 
    payload: { ...input, history: `[Array(${input.history.length})]` } 
  });

  try {
    const supabase = await createServerClient();

    // サーバー側でセッションから安全に本人のユーザーIDを検証・取得（偽装防止）
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // self_t_sprint へのインサート
    const { data, error } = await supabase
      .from("self_t_sprint")
      .insert([
        {
          user_id: user.id,
          question_type: input.question_type,
          answer_type: input.answer_type,
          difficulty_level: Number(input.difficulty_level),
          time_limit_sec: Number(input.time_limit_sec),
          total_answered: Number(input.total_answered),
          answered_history: input.history, // JSONBに履歴配列を丸ごと格納
        }
      ])
      .select("self_sprint_id")
      .single();

    if (error) throw error;

    logger.info("sprint:create_score_success", "Successfully saved sprint result", {
      ...ctx,
      self_sprint_id: data.self_sprint_id
    });

    return { success: true, data: { self_sprint_id: data.self_sprint_id } };

  } catch (error: any) {
    logger.error("sprint:create_score_error", "Failed to create sprint score", {
      ...ctx,
      payload: { error: error.message }
    });
    return { success: false, data: null, error: error.message || "Failed to save sprint results" };
  }
}

/**
 * 指定された結果IDから、当時の「出題・解答順序」の通りに問題を再構築してフェッチするServer Action
 */
export async function getSprintResultAction(
  self_sprint_id: string
): Promise<SprintResultResponse> {
  const ctx = await getLogContext();
  logger.info("sprint:get_result_start", "getSprintResultAction start", { ...ctx, self_sprint_id });

  try {
    const supabase = await createServerClient();

    // ① スコア・履歴レコードを1件取得
    const { data: scoreRecord, error: scoreError } = await supabase
      .from("self_t_sprint")
      .select("*")
      .eq("self_sprint_id", self_sprint_id)
      .single();

    if (scoreError) throw scoreError;
    if (!scoreRecord) throw new Error("Sprint record not found");

    const history = (scoreRecord.answered_history as SprintHistoryItem[]) ?? [];

    // 履歴が空の場合は空配列で早期リターン
    if (history.length === 0) {
      return { success: true, data: { scoreRecord: scoreRecord as any, questions: [] } };
    }

    // ② 履歴に記録されている全ての question_id を抽出
    const targetIds = history.map(h => h.question_id);

    // ③ 問題マスタから該当する問題データを一括フェッチ
    const { data: questionsData, error: qError } = await supabase
      .from("com_m_sprint_questions")
      .select("*")
      .in("question_id", targetIds);

    if (qError) throw qError;

    const rawQuestions = (questionsData as SprintQuestion[]) ?? [];

    // ④ 問題マスタから取得したデータを、保存されていた history 配列のインデックス順に完全に再ソート
    const sortedQuestions = history
      .map(hist => rawQuestions.find(q => q.question_id === hist.question_id))
      .filter((q): q is SprintQuestion => !!q); // 存在しない場合（万が一のデータ削除など）の型ガード除外

    logger.info("sprint:get_result_success", "Successfully recovered sprint session playlist order", {
      ...ctx,
      total_recovered: sortedQuestions.length
    });

    return {
      success: true,
      data: {
        scoreRecord: scoreRecord as any,
        questions: sortedQuestions // 結果画面へ当時の順序のまま受け渡される
      }
    };

  } catch (error: any) {
    logger.error("sprint:get_result_error", "Failed to recover sprint result", {
      ...ctx,
      payload: { error: error.message }
    });
    return { success: false, data: null, error: error.message || "Failed to load session results" };
  }
}

/**
 * ユーザーの特定月のスプリント履歴一覧を取得する
 * @param yearMonth 'YYYY-MM' 形式の文字列
 */
export async function getUserSprintHistoryAction(yearMonth: string) {
  const ctx = await getLogContext();
  logger.info("sprint:get_history_start", "getUserSprintHistoryAction start", { ...ctx, yearMonth });

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // 月の開始日と終了日を計算 (UTCベースでクエリ)
    const [year, month] = yearMonth.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString();
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();

    const { data, error } = await supabase
      .from("self_t_sprint")
      .select(`
        self_sprint_id,
        question_type,
        answer_type,
        difficulty_level,
        time_limit_sec,
        total_answered,
        insert_date
      `)
      .eq("user_id", user.id)
      .gte("insert_date", startDate)
      .lte("insert_date", endDate)
      .order("insert_date", { ascending: false });

    if (error) throw error;

    logger.info("sprint:get_history_success", "Successfully fetched sprint history", {
      ...ctx,
      count: data?.length || 0
    });

    return { success: true, data: data || [] };

  } catch (error: any) {
    logger.error("sprint:get_history_error", "Failed to fetch sprint history", {
      ...ctx,
      payload: { error: error.message }
    });
    return { success: false, data: [], error: error.message };
  }
}

/**
 * ユーザーの最後のスプリントセッション設定（種別・レベル・制限時間）を取得する
 * 目的: セッション開始前の設定画面での初期値復元
 */
export async function getLastSprintSessionAction() {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // 最新の1件を取得
    const { data, error } = await supabase
      .from("self_t_sprint")
      .select("question_type, difficulty_level, time_limit_sec")
      .eq("user_id", user.id)
      .order("insert_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return { success: true, data };

  } catch (error: any) {
    logger.error("sprint:get_last_session_error", "Failed to fetch last session info", {
      ...ctx,
      payload: { error: error.message }
    });
    return { success: false, data: null, error: error.message };
  }
}