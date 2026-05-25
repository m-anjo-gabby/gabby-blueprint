'use server';

import { createServerClient } from "@gabby/lib/supabase/server";
import { SprintQuestion, SprintQuestionResponse } from "@gabby/types/sprint";
import { createLogger, getLogContext } from "@gabby/lib/logger";

const logger = createLogger("student");
const SPRINT_LIMIT_COUNT = 10;

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
    // 🔑 apps/studentルール遵守: サーバー用クライアントを使用
    const supabase = await createServerClient();

    // 🔒 パラメータの型不整合を完全に防止する安全なキャスト
    const safeType = String(question_type).trim();
    const safeLevel = Number(difficulty_level);

    // 🛡️ 最適化: RLSポリシー「Users can view sprint questions (authenticated)」を通過させ、
    // 条件に合致する対象データを一度のクエリでストレートに全件取得
    const { data: fetchedData, error } = await supabase
      .from("com_m_sprint_questions")
      .select("*")
      .eq("question_type", safeType)
      .eq("difficulty_level", safeLevel)
      .eq("delete_flg", "0");

    if (error) throw error;

    const rawRows = (fetchedData as SprintQuestion[]) ?? [];

    // データが1件も存在しない場合は早期リターン
    if (rawRows.length === 0) {
      logger.info("sprint:fetch_empty", "No questions found at all for this type/level", ctx);
      return { success: true, data: [] };
    }

    let finalData: SprintQuestion[] = [];

    // ========================================================================
    // ⚡ CASE 1: Speed問題仕様 (question_type === "0" / group_id なし)
    // ========================================================================
    if (safeType === "0") {
      if (mode === 'sprint') {
        // スプリントならランダムに10問切り出し
        finalData = shuffleArray(rawRows).slice(0, SPRINT_LIMIT_COUNT);
      } else {
        // ドリルなら毎回新鮮に解けるよう全件シャッフル
        finalData = shuffleArray(rawRows);
      }
    } 
    // ========================================================================
    // 📑 CASE 2: Structure, Builders, Mastery仕様 (3問1組のグループ制御)
    // ========================================================================
    else {
      if (mode === 'sprint') {
        // ① JavaScriptの高速なSetオブジェクトを使い、一撃でユニークなグループID群を抽出
        const allUniqueGroupIds = Array.from(new Set(rawRows.map(item => item.group_id).filter(Boolean)));
        
        // ② グループIDの配列自体をシャッフルし、最大10グループを抽選
        const sampledGroupIds = shuffleArray(allUniqueGroupIds).slice(0, SPRINT_LIMIT_COUNT);

        // ③ 抽選されたグループに属するデータだけに絞り込み、[グループID ➡️ 配列順(seq_no)] にソート
        finalData = rawRows
          .filter(item => sampledGroupIds.includes(item.group_id))
          .sort((a, b) => {
            if (a.group_id! < b.group_id!) return -1;
            if (a.group_id! > b.group_id!) return 1;
            return (a.seq_no || 0) - (b.seq_no || 0);
          });
      } else {
        // 教材ドリルモード: 履修順序通りにしっかり網羅できるよう、そのまま group_id ➡️ seq_no でソート
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