"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { FAVORITE_PHRASE_COLUMNS, FavoritePhraseItem, FavoriteResponse, TrainingWord, TrainingWordResponse } from "@gabby/types/word";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";
import { toggleFavoriteRow } from "@/lib/favoriteToggle";
import { FAVORITE_LIMIT, type FavoriteToggleResult } from "@/constants/favorites";
import { getAuthUser } from '@gabby/lib/supabase/authUser';

const logger = createLogger('student');

/**
 * 指定されたコンテンツIDに紐付く単語とフレーズを取得
 */
export async function getWordData(contentId: string): Promise<TrainingWordResponse> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await supabase
      .from('com_m_word')
      .select(`
        *,
        com_m_contents!inner ( content_name, metadata ),
        com_m_phrase (
          *,
          com_t_favorite_phrase ( phrase_id )
        )
      `)
      .eq('content_id', contentId)
      .eq('status', 'live')
      .eq('com_m_phrase.status', 'live')
      .eq('com_m_phrase.com_t_favorite_phrase.user_id', user.id)
      .order('frequency_rank', { ascending: true })
      .order('seq_no', { referencedTable: 'com_m_phrase', ascending: true });

    // 注: RLSにより、権限がない場合は com_m_contents が inner join で空になるため、
    // 結果として data 自体が空配列になります。

    if (error) {
      logger.error("word:get_training_data_failed", error.message, { ...ctx, err: error, payload: { contentId } });
      throw new Error(`取得失敗: ${error.message}`);
    }

    const rawData = data as any[];

    // データが1件も取得できなかった場合
    if (!rawData || rawData.length === 0) {
      // 教材の存在自体を別途確認（RLSの影響を受けないようにするか、あるいは単に「利用不可」とする）
      // ここではセキュリティを優先し、詳細な理由は伏せて「利用不可」のステータスを返します
      return { 
        words: [], 
        contentName: 'Unavailable Content' 
      };
    }

    const firstItem = rawData[0];

    // --- 教材情報の抽出 ---
    let contentName = 'Training';
    let cefrData: { id: string; label: string } | undefined = undefined;

    if (firstItem?.com_m_contents) {
      const contents = Array.isArray(firstItem.com_m_contents) 
        ? firstItem.com_m_contents[0] 
        : firstItem.com_m_contents;
      
      contentName = contents?.content_name || 'Training';
      // 教材マスターのmetadataからcefrを抽出
      cefrData = contents?.metadata?.cefr;
    }

    // TrainingWord[] 型に準拠するようにマッピング
    const words: TrainingWord[] = rawData.map((word) => ({
      ...word, // word_id, word_en, word_ja, status, insert_date 等をすべて継承
      phrases: (word.com_m_phrase || []).map((p: any) => ({
        ...p, // phrase_id, phrase_en, phrase_ja, phrase_type, status, tts_status 等をすべて継承
        // UI制御用のプロパティをセット（is_favorite に統一）
        is_favorite: Array.isArray(p.com_t_favorite_phrase) && p.com_t_favorite_phrase.length > 0 
      }))
    }));

    return { 
      words, 
      contentName,
      cefr: cefrData // 戻り値にCEFR情報を追加
    };
    
  } catch (err) {
    logger.error("word:get_training_data_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, err, payload: { contentId } });
    throw err;
  }
}

/**
 * フレーズのお気に入り状態を切り替える（上限超過・失敗は戻り値で返す）
 */
export async function toggleFavorite(phraseId: string, isFavorite: boolean): Promise<FavoriteToggleResult> {
  return toggleFavoriteRow('phrase', phraseId, isFavorite);
}

/**
 * お気に入りの総数を取得
 */
export async function getFavoriteCount(): Promise<number> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return 0;

    const { count, error } = await supabase
      .from('com_t_favorite_phrase')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (error) {
      logger.error("word:get_favorite_count_failed", error.message, { ...ctx, err: error });
      return 0;
    }

    return count || 0;
  } catch (err) {
    logger.error("word:get_favorite_count_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return 0;
  }
}

/**
 * お気に入りのフレーズ一覧を取得
 */
export async function getFavoritePhrases(): Promise<FavoritePhraseItem[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    
    const user = await getAuthUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('com_t_favorite_phrase')
      .select(`
        favorite_id,
        phrase_id,
        insert_date,
        com_m_phrase!inner (
          ${FAVORITE_PHRASE_COLUMNS.join(', ')},
          com_m_word!inner (
            word_en,
            com_m_contents!inner (
              content_id,
              content_name
            )
          )
        )
      `)
      .eq('user_id', user.id)
      .neq('com_m_phrase.com_m_word.com_m_contents.content_scope', 9)
      .order('insert_date', { ascending: false })
      .limit(FAVORITE_LIMIT);

    if (error) {
      logger.error("word:get_favorite_phrases_failed", error.message, { ...ctx, err: error });
      throw new Error(`取得失敗: ${error.message}`);
    }

    return (data as unknown as FavoriteResponse[]).map(({ com_m_phrase: { com_m_word, ...phrase }, ...item }) => ({
      ...phrase,
      favorite_id: item.favorite_id,
      insert_date: item.insert_date, // お気に入り登録日
      word_en: com_m_word.word_en,
      content_id: com_m_word.com_m_contents.content_id,
      content_name: com_m_word.com_m_contents.content_name,
    }));
  } catch (err) {
    logger.error("word:get_favorite_phrases_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return [];
  }
}

/**
 * 学習進捗（単語・フレーズの消化数）をサマリーテーブルに同期
 */
export async function reportWordProgress(contentId: string, wordCount: number, phraseCount: number, assessmentCount: number) {
  const ctx = await getLogContext();
  if (!contentId || (wordCount === 0 && phraseCount === 0 && assessmentCount === 0)) return;

  try {
    const supabase = await createServerClient();
    
    // p_user_id は渡さず、DB側の auth.uid() に委ねる。
    // これによりクライアント側からのID偽装を物理的に防ぎ、Server Actionの負荷も軽減。
    const { error } = await supabase.rpc('increment_word_summary', {
      p_content_id: contentId,
      p_word_count: wordCount,
      p_phrase_count: phraseCount,
      p_assessment_count: assessmentCount
    });

    if (error) throw error;
    logger.info("word:report_progress_success", `Reported progress: ${wordCount} words, ${phraseCount} phrases, ${assessmentCount} assessments`, { ...ctx, payload: { contentId, wordCount, phraseCount, assessmentCount } });
  } catch (err) {
    // 記録処理の失敗が学習体験を阻害しないよう、エラーは捕捉してログに留める（学習継続を優先）
    logger.error("word:report_progress_failed", err instanceof Error ? err.message : 'Unknown error', { ...ctx, err, payload: { contentId, wordCount, phraseCount, assessmentCount } });
  }
}

/**
 * 日次単語サマリー履歴アイテムの型
 */
export interface WordSummaryHistoryItem {
  content_id: string;
  training_date: string; // ISO string or Date string
  word_count: number;
  phrase_count: number;
  assessment_count: number;
  update_date: string;
  com_m_contents: {
    content_name: string;
  };
}

/**
 * ユーザーの特定月の単語ドリル履歴一覧を取得する
 * @param yearMonth 'YYYY-MM' 形式の文字列
 */
export async function getUserWordHistoryAction(yearMonth: string): Promise<{ success: boolean; data: WordSummaryHistoryItem[]; error?: string }> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) throw new Error("Unauthorized");

    // 月の開始日と終了日を計算 (UTCベースでクエリ)
    const [year, month] = yearMonth.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString();
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();

    const { data, error } = await supabase
      .from("self_t_word_summary")
      .select(`
        content_id,
        training_date,
        word_count,
        phrase_count,
        assessment_count,
        update_date,
        com_m_contents (
          content_name
        )
      `)
      .eq("user_id", user.id)
      .gte("training_date", startDate)
      .lte("training_date", endDate)
      .order("training_date", { ascending: false }); // 最新の日付が上に来るようにソート

    if (error) throw error;

    // Supabaseの結合結果が配列で返るため、インターフェースに合わせて平坦化する
    const formattedData = (data as any[])?.map(item => ({
      ...item,
      com_m_contents: Array.isArray(item.com_m_contents) ? item.com_m_contents[0] : item.com_m_contents
    })) || [];

    logger.debug("word:get_history_success", "Successfully fetched word summary history", {
      ...ctx,
      payload: { count: formattedData.length },
    });

    return { success: true, data: formattedData as WordSummaryHistoryItem[] };

  } catch (error: any) {
    logger.error("word:get_history_failed", "Failed to fetch word summary history", {
      ...ctx,
      err: error,
    });
    return { success: false, data: [], error: error.message };
  }
}