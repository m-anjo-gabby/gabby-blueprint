"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { FavoritePhraseItem, FavoriteResponse, TrainingWord, TrainingWordResponse } from "@gabby/types/word";
import { createLogger, getLogContext } from "@gabby/lib/logger";

const logger = createLogger('student');

/**
 * 指定されたコンテンツIDに紐付く単語とフレーズを取得
 */
export async function getWordData(contentId: string): Promise<TrainingWordResponse> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

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
      .eq('com_m_phrase.com_t_favorite_phrase.user_id', user?.id)
      .order('frequency_rank', { ascending: true })
      .order('seq_no', { referencedTable: 'com_m_phrase', ascending: true });

    // 注: RLSにより、権限がない場合は com_m_contents が inner join で空になるため、
    // 結果として data 自体が空配列になります。

    if (error) {
      logger.error("word:get_training_data_failed", error.message, { ...ctx, payload: { contentId } });
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
    logger.error("word:get_training_data_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { contentId } });
    throw err;
  }
}

/**
 * お気に入りの状態を切り替える (Toggle)
 */
export async function toggleFavorite(phraseId: string, isFavorite: boolean) {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    let error;
    if (isFavorite) {
      // 登録
      const { error: upsertError } = await supabase
        .from('com_t_favorite_phrase')
        .upsert({ user_id: user.id, phrase_id: phraseId });
      error = upsertError;
    } else {
      // 解除
      const { error: deleteError } = await supabase
        .from('com_t_favorite_phrase')
        .delete()
        .eq('user_id', user.id)
        .eq('phrase_id', phraseId);
      error = deleteError;
    }

    if (error) {
      logger.error("word:toggle_favorite_failed", error.message, { ...ctx, payload: { phraseId, isFavorite } });
      throw new Error(`お気に入り操作に失敗しました: ${error.message}`);
    }

    logger.info("word:toggle_favorite_success", `Phrase favorite ${isFavorite ? 'added' : 'removed'}`, { 
      ...ctx, 
      payload: { phraseId, isFavorite } 
    });
  } catch (err) {
    logger.error("word:toggle_favorite_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { phraseId, isFavorite } });
    throw err;
  }
}

/**
 * お気に入りの総数を取得
 */
export async function getFavoriteCount(): Promise<number> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { count, error } = await supabase
      .from('com_t_favorite_phrase')
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.error("word:get_favorite_count_failed", error.message, ctx);
      return 0;
    }

    return count || 0;
  } catch (err) {
    logger.error("word:get_favorite_count_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
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
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('com_t_favorite_phrase')
      .select(`
        favorite_id,
        phrase_id,
        insert_date,
        com_m_phrase!inner (
          *,
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
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error("word:get_favorite_phrases_failed", error.message, ctx);
      throw new Error(`取得失敗: ${error.message}`);
    }

    return (data as unknown as FavoriteResponse[]).map(item => ({
      // PhraseRecord の全フィールドをマッピングに含める
      ...item.com_m_phrase as any, 
      favorite_id: item.favorite_id,
      phrase_id: item.phrase_id,
      phrase_en: item.com_m_phrase.phrase_en,
      phrase_ja: item.com_m_phrase.phrase_ja,
      word_en: item.com_m_phrase.com_m_word.word_en,
      content_id: item.com_m_phrase.com_m_word.com_m_contents.content_id,
      content_name: item.com_m_phrase.com_m_word.com_m_contents.content_name,
      insert_date: item.insert_date, // お気に入り登録日を優先
      is_favorite: true
    }));
  } catch (err) {
    logger.error("word:get_favorite_phrases_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return [];
  }
}

/**
 * 学習進捗（単語・フレーズの消化数）をサマリーテーブルに同期
 */
export async function reportWordProgress(contentId: string, wordCount: number, phraseCount: number) {
  const ctx = await getLogContext();
  if (wordCount === 0 && phraseCount === 0) return;

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.rpc('increment_word_summary', {
      p_user_id: user.id,
      p_content_id: contentId,
      p_word_count: wordCount,
      p_phrase_count: phraseCount
    });

    if (error) throw error;
    logger.info("word:report_progress_success", `Reported progress: ${wordCount} words, ${phraseCount} phrases`, { ...ctx, payload: { contentId, wordCount, phraseCount } });
  } catch (err) {
    logger.error("word:report_progress_failed", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { contentId, wordCount, phraseCount } });
  }
}