'use server';

import { createServerClient } from "@gabby/lib/supabase/server";
import { SprintQuestion, SprintQuestionResponse } from "@gabby/types/sprint";
import { createLogger, getLogContext } from "@gabby/lib/logger";

const logger = createLogger("student");
const SPRINT_LIMIT_COUNT = 10;

/**
 * 配列をインプレースでランダムにシャッフルするヘルパー関数 (Fisher-Yatesシャッフル)
 * メモリ上での軽量サンプリングにおいて、偏りのない最も高速な標準アルゴリズムです。
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
 * * @param question_type '0'(Speed) | '4'(Structure) | '5'(Builders) | '6'(Mastery)
 * @param difficulty_level 難易度レベル
 * @param mode 'sprint'(10問/10組制限) | 'drill'(時間無制限・全件網羅)
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
    let finalData: SprintQuestion[] = [];

    // 🔑 共通のベースクエリを構築
    // (PostgreSQL側の order("random()") パースエラーおよび .not() の型制限を回避するため、
    //  安全に指定条件に合う対象データを一度一括フェッチします)
    const baseQuery = supabase
      .from("com_m_sprint_questions")
      .select("*")
      .eq("question_type", question_type)
      .eq("difficulty_level", difficulty_level)
      .eq("delete_flg", "0");

    // ========================================================================
    // ⏳ パターンA: 従来のGabbyスプリントモード（制限時間あり、10問 / 10組制限）
    // ========================================================================
    if (mode === 'sprint') {
      
      if (question_type === "0") {
        // ⚡ Speed問題仕様 (group_id = NULL)
        const { data, error } = await baseQuery;
        if (error) throw error;

        const allQuestions = (data as SprintQuestion[]) ?? [];
        finalData = shuffleArray(allQuestions).slice(0, SPRINT_LIMIT_COUNT);
        
      } else {
        // 📑 Structure, Builders, Mastery仕様 (3問1組のストーリー展開)
        // 🛡️ 確実化策: 分割クエリによる不適合を避けるため、ベース条件に合う全レコードをストレートに取得
        const { data: allFetchedData, error: fetchError } = await baseQuery;
        if (fetchError) throw fetchError;
        
        const rawRows = (allFetchedData as SprintQuestion[]) ?? [];
        
        // 📝 データの到達状況を開発者ターミナルへ透過的に出力 (確認用ログ)
        console.log("=== 🕵️ SPRINT FETCH DEBUG ===");
        console.log(`[条件] type: ${question_type}, level: ${difficulty_level}`);
        console.log("取得できたレコード総数:", rawRows.length);
        if (rawRows.length > 0) {
          console.log("先頭レコードのサンプル:", {
            question_id: rawRows[0].question_id,
            group_id: rawRows[0].group_id,
            seq_no: rawRows[0].seq_no,
            question: rawRows[0].question
          });
        }
        console.log("=============================");

        if (rawRows.length === 0) {
          logger.info("sprint:fetch_empty", "No questions found at all for this type/level", ctx);
          return { success: true, data: [] };
        }

        // ① 取得データから、JavaScript側で安全にユニークなグループIDのリストを抽出
        const allUniqueGroupIds = Array.from(
          new Set(rawRows.map((item) => item.group_id).filter(Boolean))
        );

        // ② 有効なグループID群をランダムシャッフルし、上位10個（最大10組）を抽選
        const sampledGroupIds = shuffleArray(allUniqueGroupIds).slice(0, SPRINT_LIMIT_COUNT);

        // ③ 抽選された10組のグループに属するデータだけに絞り込み、[グループID昇順 ➡️ カリキュラム(seq_no)昇順] に再整列
        finalData = rawRows
          .filter((item) => sampledGroupIds.includes(item.group_id))
          .sort((a, b) => {
            if (a.group_id! < b.group_id!) return -1;
            if (a.group_id! > b.group_id!) return 1;
            return (a.seq_no || 0) - (b.seq_no || 0);
          });
      }

    // ========================================================================
    // 📖 パターンB: 教材ドリルモード（無制限、しらみつぶし全件網羅）
    // ========================================================================
    } else {
      
      if (question_type === "0") {
        // ⚡ Speed問題仕様
        // 何度でも新鮮な感覚で単語帳ドリルを回せるよう、全件をシャッフルして返却
        const { data, error } = await baseQuery;
        if (error) throw error;
        finalData = shuffleArray((data as SprintQuestion[]) ?? []);
        
      } else {
        // 📑 Structure, Builders, Mastery仕様
        // カリキュラム順・ステップ順通りに確実に履修できるよう、group_id ➡️ seq_noの順序で全件ソート
        const { data, error } = await baseQuery
          .order("group_id", { ascending: true })
          .order("seq_no", { ascending: true });

        if (error) throw error;
        finalData = (data as SprintQuestion[]) ?? [];
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