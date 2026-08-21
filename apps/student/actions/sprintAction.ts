'use server';

import { createServerClient } from "@gabby/lib/supabase/server";
import { SprintQuestion, SprintQuestionResponse, SprintQuestionType } from "@gabby/types/sprint";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";
import { resolveSprintHasLevel } from "@gabby/lib";
import type { ContentMetadata } from "@gabby/types/content";

const logger = createLogger("student");
const SPRINT_LIMIT_COUNT = 10;
const SPRINT_SPEED_LIMIT_COUNT = 30;

// ========================================================================
// 📊 型定義（Types）
// ========================================================================

/**
 * 発話評価の詳細レコード型（拡張用）
 */
export interface SprintAssessmentResult {
  pronunciation_score?: number; // 発音スコア (0-100)
  fluency_score?: number;       // 流暢さスコア (0-100)
  total_score?: number;         // 総合スコア
  evaluated_at?: string;        // 評価日時 (ISOString)
  // 必要に応じて解析テキスト、エラー詳細などを追加可能
}

/**
 * 出題順序やグループ構造に加え、評価結果・スキップ情報を完全再現するための履歴オブジェクト型
 */
export interface SprintHistoryItem {
  question_id: string;
  group_id: string | null;
  seq_no: number;
  
  // 🌟 追加拡張フィールド
  is_skipped: boolean;                        // スキップされたかどうか
  assessment?: SprintAssessmentResult | null; // 発話評価が含まれる場合のリレーションオブジェクト
}

/**
 * 自主トレスプリント結果登録用の入力ペイロード型
 */
export interface CreateSprintScoreInput {
  sprint_type: string;
  content_id: string;
  question_type: '0' | '4' | '5' | '6';
  answer_type: string;
  difficulty_level: number;
  time_limit_sec: number;
  total_answered: number;
  total_assessments: number;
  history: SprintHistoryItem[]; // 🌟 拡張された answered_history 配列が入る
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
      sprint_type: string;
      content_id: string;
      question_type: string;
      answer_type: string;
      difficulty_level: number;
      time_limit_sec: number;
      total_answered: number;
      answered_history: SprintHistoryItem[]; // 🌟 拡張された履歴
      insert_date: string;
      update_date: string;
    };
    questions: SprintQuestion[];
    totalAssessmentCount: number;
    averageAssessmentScore: number;
    // 🛠️ 教材メタデータから解決した「レベル概念の有無」。
    // 呼び出し側（page.tsx）が別途 getContentAction で再取得する必要がないよう、
    // self_t_sprint と com_m_contents を1クエリでJOINして解決した値をここに含める。
    hasLevel: boolean;
  } | null;
  error?: string;
}

// ========================================================================
// 🛠️ ユーティリティ・ヘルパー
// ========================================================================
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
  content_id: string,
  question_type: '0' | '4' | '5' | '6',
  difficulty_level: number,
  mode: 'sprint' | 'drill' = 'sprint'
): Promise<SprintQuestionResponse> {
  const ctx = await getLogContext();
  
  logger.info("sprint:fetch_start", "getSprintQuestionsAction start", {
    ...ctx,
    payload: { content_id, question_type, difficulty_level, mode }
  });

  try {
    const supabase = await createServerClient();

    const safeContentId = String(content_id).trim();
    const safeType = String(question_type).trim();
    const safeLevel = Number(difficulty_level);

    const { data: fetchedData, error } = await supabase
      .from("com_m_sprint_questions")
      .select("*")
      .eq("content_id", safeContentId)
      .eq("question_type", safeType)
      .eq("difficulty_level", safeLevel)
      .eq("delete_flg", "0");

    if (error) throw error;

    const rawRows = (fetchedData as SprintQuestion[]) ?? [];

    if (rawRows.length === 0) {
      logger.info("sprint:fetch_empty", "No questions found at all for this content/type/level", ctx);
      return { success: true, data: [] };
    }

    let finalData: SprintQuestion[] = [];

    if (safeType === "0") {
      if (mode === 'sprint') {
        finalData = shuffleArray(rawRows).slice(0, SPRINT_SPEED_LIMIT_COUNT);
      } else {
        finalData = shuffleArray(rawRows);
      }
    } 
    else {
      // 1. ユニークな group_id を抽出
      const allUniqueGroupIds = Array.from(new Set(rawRows.map(item => item.group_id).filter(Boolean))) as string[];
      
      // 2. group_id リストをシャッフルし、モードに応じてスライス
      let targetGroupIds = shuffleArray(allUniqueGroupIds);
      if (mode === 'sprint') {
        targetGroupIds = targetGroupIds.slice(0, SPRINT_LIMIT_COUNT);
      }

      // 3. group_id ごとに問題をマップに格納
      const groupMap = new Map<string, SprintQuestion[]>();
      rawRows.forEach(item => {
        if (!item.group_id) return;
        if (!groupMap.has(item.group_id)) {
          groupMap.set(item.group_id, []);
        }
        groupMap.get(item.group_id)!.push(item);
      });

      // 4. 各グループの問題を seq_no 順にソート
      groupMap.forEach((questions) => {
        questions.sort((a, b) => (a.seq_no || 0) - (b.seq_no || 0));
      });

      // 5. シャッフルされた targetGroupIds の順番で問題をフラットに結合
      finalData = targetGroupIds.flatMap(groupId => groupMap.get(groupId) || []);
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

    // サーバー側でセッションから安全に本人のユーザーIDを検証・取得
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // self_t_sprint へのインサート (JSONBなので拡張されたオブジェクト配列をそのまま渡せる)
    const { data, error } = await supabase
      .from("self_t_sprint")
      .insert([
        {
          user_id: user.id,
          sprint_type: input.sprint_type,
          content_id: input.content_id,
          question_type: input.question_type,
          answer_type: input.answer_type,
          difficulty_level: Number(input.difficulty_level),
          time_limit_sec: Number(input.time_limit_sec),
          total_answered: Number(input.total_answered),
          total_assessments: Number(input.total_assessments),
          answered_history: input.history, // 🌟 評価やスキップ情報がそのままJSONBとして保存されます
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

    // サーバー側でセッションから安全に本人のユーザーIDを検証・取得
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // ① スコア・履歴レコードを1件取得（本人のレコードのみ）
    // 🛠️ hasLevel 解決に必要な教材メタデータ（com_m_contents.metadata）を同一クエリでJOIN取得し、
    // 呼び出し側（page.tsx）での直列2回目のDB往復（getContentAction）を不要にする
    const { data: scoreRecord, error: scoreError } = await supabase
      .from("self_t_sprint")
      .select("*, com_m_contents(metadata)")
      .eq("self_sprint_id", self_sprint_id)
      .eq("user_id", user.id)
      .single();

    if (scoreError) throw scoreError;
    if (!scoreRecord) throw new Error("Sprint record not found");

    const joinedContent = scoreRecord.com_m_contents as { metadata?: ContentMetadata | null } | { metadata?: ContentMetadata | null }[] | null;
    const contentMetadata = Array.isArray(joinedContent) ? joinedContent[0]?.metadata : joinedContent?.metadata;
    const hasLevel = resolveSprintHasLevel(contentMetadata?.sprint);

    let history: SprintHistoryItem[] = [];
    if (scoreRecord.answered_history) {
      if (typeof scoreRecord.answered_history === 'string') {
        try {
          history = JSON.parse(scoreRecord.answered_history);
        } catch (e) {
          logger.error("sprint:parse_history_error", "Failed to parse answered_history string", { ...ctx, error: e });
          history = [];
        }
      } else {
        history = scoreRecord.answered_history as SprintHistoryItem[];
      }
    }

    // 🆕 【追加ロジック】ここで発話数と平均スコアを事前に集計・計算する
    let totalAssessmentCount = 0;
    let totalScoreSum = 0;
    let scoredQuestionsCount = 0;

    history.forEach((h) => {
      // is_skipped が false、または未定義/nullのものを「発話した」と判定
      if (h.is_skipped === false) {
        totalAssessmentCount++;
        
        // assessment 内の total_score を加算
        if (h.assessment && typeof h.assessment.total_score === 'number') {
          totalScoreSum += h.assessment.total_score;
          scoredQuestionsCount++;
        }
      }
    });

    // 平均スコアの算出（0割りを防ぐ・四捨五入で整数に丸める）
    const averageAssessmentScore = scoredQuestionsCount > 0 
      ? Math.round(totalScoreSum / scoredQuestionsCount) 
      : 0;


    if (history.length === 0) {
      return {
        success: true,
        data: {
          scoreRecord: scoreRecord as any,
          questions: [],
          totalAssessmentCount: 0,
          averageAssessmentScore: 0,
          hasLevel,
        }
      };
    }

    // ② 履歴に記録されている全ての question_id を抽出
    const targetIds = history.map(h => h.question_id);

    // ③ 問題マスタから該当する問題データを一括フェッチ
    const { data: questionsData, error: qError } = await supabase
      .from("com_m_sprint_questions")
      .select("*")
      .in("question_id", targetIds);

    if (qError) throw qError;

    const rawQuestions = (questionsData as any[]) ?? [];

    // ④ 問題マスタから取得したデータを、保存されていた history 配列のインデックス順に完全に再ソート
    const sortedQuestions = history
      .map(hist => rawQuestions.find(q => q.question_id === hist.question_id))
      .filter((q): q is any => !!q);

    logger.info("sprint:get_result_success", "Successfully recovered sprint session playlist order", {
      ...ctx,
      total_recovered: sortedQuestions.length
    });

    // 🆕 戻り値の data オブジェクトに計算済みの値を載せる
    return {
      success: true,
      data: {
        scoreRecord: scoreRecord as any,
        questions: sortedQuestions,
        totalAssessmentCount,
        averageAssessmentScore,
        hasLevel,
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

    // 1. スプリントセッション履歴の取得
    const { data: sessionsData, error: sessionsError } = await supabase
      .from("self_t_sprint")
      .select(`
        self_sprint_id,
        sprint_type,
        content_id,
        question_type,
        answer_type,
        difficulty_level,
        time_limit_sec,
        total_answered,
        insert_date,
        com_m_contents (
          content_name,
          metadata
        )
      `)
      .eq("user_id", user.id)
      .gte("insert_date", startDate)
      .lte("insert_date", endDate)
      .order("insert_date", { ascending: false });

    if (sessionsError) throw sessionsError;

    // 2. ドリル日次サマリー履歴の取得
    const startDayStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data: drillsData, error: drillsError } = await supabase
      .from("self_t_sprint_summary")
      .select(`
        summary_id,
        user_id,
        content_id,
        training_date,
        question_count,
        assessment_count,
        speed_count,
        structure_count,
        builders_count,
        mastery_count,
        com_m_contents (
          content_name
        )
      `)
      .eq("user_id", user.id)
      .gte("training_date", startDayStr)
      .lte("training_date", endDayStr)
      .order("training_date", { ascending: false });

    if (drillsError) throw drillsError;

    logger.info("sprint:get_history_success", "Successfully fetched sprint and drill history", {
      ...ctx,
      sessionsCount: sessionsData?.length || 0,
      drillsCount: drillsData?.length || 0
    });

    return { 
      success: true, 
      data: {
        sessions: sessionsData || [],
        drills: drillsData || []
      } 
    };

  } catch (error: any) {
    logger.error("sprint:get_history_error", "Failed to fetch sprint history", {
      ...ctx,
      payload: { error: error.message }
    });
    return { 
      success: false, 
      data: { sessions: [], drills: [] }, 
      error: error.message 
    };
  }
}

/**
 * ユーザーの最後のスプリントセッション設定（種別・レベル・制限時間）を取得する
 * 目的: セッション開始前の設定画面での初期値復元
 */
export async function getLastSprintSessionAction(contentId?: string) {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // 最新の1件を取得
    let query = supabase
      .from("self_t_sprint")
      .select("sprint_type, content_id, question_type, difficulty_level, time_limit_sec")
      .eq("user_id", user.id);

    if (contentId) {
      query = query.eq("content_id", contentId);
    }

    const { data, error } = await query
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

/**
 * ユーザーのスプリント進捗状況（各種別の到達レベル）を取得する
 */
export async function getSprintProgressAction() {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { data, error } = await supabase
      .from("student_m_sprint_progress")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    // データが存在しない場合は null を返し、呼び出し側でデフォルト値を扱う
    return { success: true, data };

  } catch (error: any) {
    logger.error("sprint:get_progress_error", "Failed to fetch sprint progress", {
      ...ctx,
      payload: { error: error.message }
    });
    return { success: false, data: null, error: error.message };
  }
}

/**
 * スプリント学習進捗（問題の消化数・発話評価数）をサマリーテーブルに同期
 * * @param contentId 教材ID (UUID)
 * @param questionCount 今回同期する延べ問題数（差分値）
 * @param assessmentCount 今回同期する発話評価回数（差分値）
 * @param questionType 問題種別 ('0': Speed, '4': Structure, '5': Builders, '6': Mastery)
 */
export async function reportSprintProgress(
  contentId: string,
  questionCount: number,
  assessmentCount: number,
  questionType: SprintQuestionType // 型安全な問題種別パラメータ
): Promise<void> {
  const ctx = await getLogContext();

  // バリデーション: IDの不在、または更新値がすべて0の場合は早期リターン
  if (!contentId || (questionCount === 0 && assessmentCount === 0)) {
    return;
  }

  try {
    const supabase = await createServerClient();

    // 修正した4引数版の RPC (increment_sprint_summary) を呼び出し
    // p_user_id はセキュリティ担保のためDB側の auth.uid() に委ねる
    const { error } = await supabase.rpc("increment_sprint_summary", {
      p_content_id: contentId,
      p_question_count: questionCount,
      p_assessment_count: assessmentCount,
      p_question_type: questionType, // 【新規追加】
    });

    if (error) throw error;

    logger.info(
      "sprint:report_progress_success",
      `Reported sprint progress: ${questionCount} questions (${questionType}), ${assessmentCount} assessments`,
      { ...ctx, payload: { contentId, questionCount, assessmentCount, questionType } }
    );
  } catch (err) {
    // 記録処理の失敗（ネットワーク一時不通など）が、ユーザーのドリル学習継続を阻害しないよう、
    // エラーは捕捉してログに留めるソフトランディング構造を維持
    logger.error(
      "sprint:report_progress_failed",
      err instanceof Error ? err.message : "Unknown error",
      { ...ctx, payload: { contentId, questionCount, assessmentCount, questionType } }
    );
  }
}

/**
 * 教材情報を取得するServer Action
 */
export async function getContentAction(contentId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("com_m_contents")
      .select("*")
      .eq("content_id", contentId)
      .eq("delete_flg", "0")
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    logger.error("sprint:get_content_failed", error.message, ctx);
    return { success: false, error: error.message };
  }
}