'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { PhraseRecord, WordRecord } from '@gabby/types/word';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger/logger';

const logger = createLogger('admin');

/**
 * 特定の教材に紐づく単語一覧を取得する
 */
export async function getWordsByContentId(contentId: string): Promise<WordRecord[]> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('com_m_word')
      .select('*')
      .eq('content_id', contentId)
      .order('frequency_rank', { ascending: true }); // 頻出度のランク昇順

    if (error) {
      logger.error('word:get_words_by_content_id_failed', error.message, { contentId });
      return [];
    }

    return data as WordRecord[];
  } catch (err) {
    logger.error('word:get_words_by_content_id_unexpected', err instanceof Error ? err.message : 'Unknown error', { contentId });
    return [];
  }
}

/**
 * 単語の登録または更新 (Upsert)
 */
export async function upsertWord(payload: Partial<WordRecord>) {
  try {
    const supabase = await createAdminClient();

    const isEdit = !!payload.word_id;

    // 送信データの整形
    const wordData = {
      content_id: payload.content_id,
      word_en: payload.word_en,
      word_ja: payload.word_ja,
      frequency_rank: payload.frequency_rank,
      status: payload.status,
      update_date: new Date().toISOString(),
    };

    let error;
    let savedWordId = payload.word_id;

    if (isEdit) {
      // 更新
      const { error: updateError } = await supabase
        .from('com_m_word')
        .update(wordData)
        .eq('word_id', payload.word_id as string);
      error = updateError;
    } else {
      // 新規登録
      const { data: insertData, error: insertError } = await supabase
        .from('com_m_word')
        .insert([{ 
          ...wordData, 
          insert_date: new Date().toISOString() 
        }])
        .select('word_id')
        .single();
      error = insertError;
      if (insertData) savedWordId = insertData.word_id;
    }

    if (error) {
      logger.error('word:upsert_word_failed', error.message, { payload });
      return { 
        success: false, 
        message: error.message || "データベース操作に失敗しました" 
      };
    }

    logger.info('word:upsert_word_success', `Word ${isEdit ? 'updated' : 'created'}: ${payload.word_en}`, { 
      payload: { wordId: savedWordId, wordEn: payload.word_en, isEdit } 
    });

    // キャッシュの更新（管理画面のパスを指定）
    revalidatePath('/contents/[id]/words', 'page');

    return { success: true };
  } catch (error: any) {
    logger.error('word:upsert_word_unexpected', error instanceof Error ? error.message : 'Unknown error', { payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 単語の物理削除（関連するStorage内の音声ファイルも含む）
 */
export async function deleteWord(wordId: string) {
  try {
    const supabase = createAdminClient();

    // 1. Storage内の該当単語ディレクトリ (words/[wordId]/) 配下のファイルを特定
    // phrases フォルダの中身を含めてリストアップ
    const folderPath = `words/${wordId}/phrases`;
    const { data: files, error: listError } = await supabase
      .storage
      .from('audio')
      .list(folderPath);

    // 2. ファイルが存在すれば一括削除を実行
    if (files && files.length > 0) {
      const pathsToDelete = files.map(f => `${folderPath}/${f.name}`);
      
      const { error: removeError } = await supabase
        .storage
        .from('audio')
        .remove(pathsToDelete);

      if (removeError) {
        // 音声の削除失敗時はログ出力し、DB削除を優先する。
        logger.warn("word:storage_cleanup_failed", `Storage Cleanup Error (non-critical): ${removeError.message}`, { wordId, folderPath });
      }
    }

    // 3. DBから単語を削除
    // ※ 外部キー制約 (ON DELETE CASCADE) により、com_m_phrase のレコードも自動で消えます
    const { error: dbError } = await supabase
      .from('com_m_word')
      .delete()
      .eq('word_id', wordId);

    if (dbError) {
      logger.error('word:delete_word_db_failed', dbError.message, { wordId });
      throw dbError;
    }

    logger.info('word:delete_word_success', `Word deleted`, { 
      payload: { wordId } 
    });
    
    return { success: true };

  } catch (error: any) {
    logger.error("word:delete_word_unexpected", error instanceof Error ? error.message : 'Unknown error', { wordId });
    return { 
      success: false, 
      message: "予期せぬエラーが発生しました" 
    };
  }
}

/**
 * 特定の単語に紐づくフレーズ一覧を取得する
 */
export async function getPhrasesByWordId(wordId: string): Promise<PhraseRecord[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_phrase')
      .select('*')
      .eq('word_id', wordId)
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error('word:get_phrases_by_word_id_failed', error.message, { wordId });
      return [];
    }
    return data as PhraseRecord[];
  } catch (err) {
    logger.error('word:get_phrases_by_word_id_unexpected', err instanceof Error ? err.message : 'Unknown error', { wordId });
    return [];
  }
}

/**
 * フレーズの登録または更新 (Upsert)
 */
export async function upsertPhrase(payload: Partial<PhraseRecord>) {
  try {
    const supabase = createAdminClient();
    const isEdit = !!payload.phrase_id;

    const phraseData = {
      word_id: payload.word_id,
      phrase_en: payload.phrase_en,
      phrase_ja: payload.phrase_ja,
      phrase_type: payload.phrase_type,
      seq_no: payload.seq_no,
      status: payload.status,
      // 編集時は既存のTTS情報を維持、新規はデフォルト値を想定（DDLに準拠）
      update_date: new Date().toISOString(),
    };

    let error;
    let savedPhraseId = payload.phrase_id;

    if (isEdit) {
      const { error: updateError } = await supabase
        .from('com_m_phrase')
        .update(phraseData)
        .eq('phrase_id', payload.phrase_id as string);
      error = updateError;
    } else {
      const { data: insertData, error: insertError } = await supabase
        .from('com_m_phrase')
        .insert([{ ...phraseData, insert_date: new Date().toISOString() }])
        .select('phrase_id')
        .single();
      error = insertError;
      if (insertData) savedPhraseId = insertData.phrase_id;
    }

    if (error) {
      logger.error('word:upsert_phrase_failed', error.message, { payload });

      // ユニーク制約違反 (コード: 23505) のハンドリング
      if (error.code === '23505') {
        return { 
          success: false, 
          message: "表示順 (Seq No) が重複しています。別の数値を入力してください。" 
        };
      }

      return { success: false, message: error.message };
    }

    logger.info('word:upsert_phrase_success', `Phrase ${isEdit ? 'updated' : 'created'} for word: ${payload.word_id}`, { 
      payload: { phraseId: savedPhraseId, wordId: payload.word_id, isEdit } 
    });

    revalidatePath('/contents/[id]/words', 'page');
    return { success: true };
  } catch (error: any) {
    logger.error('word:upsert_phrase_unexpected', error instanceof Error ? error.message : 'Unknown error', { payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * フレーズの物理削除（音声ファイルも含む）
 */
export async function deletePhrase(phraseId: string, audioPath?: string | null) {
  try {
    const supabase = createAdminClient();

    // 1. Storageから該当する音声ファイルを削除
    if (audioPath) {

      // セキュリティチェック：パスに自分のphraseIdが含まれているか確認
      // words/[wordId]/phrases/[phraseId]-[timestamp].mp3 の形式を想定
      if (!audioPath.includes(phraseId)) {
        logger.error('word:delete_phrase_security_alert', `Attempted to delete unauthorized path. phraseId: ${phraseId}, path: ${audioPath}`);
        throw new Error("不正なファイルパスが指定されました。");
      }

      const { error: storageError } = await supabase.storage
        .from('audio')
        .remove([audioPath]);

      if (storageError) {
        logger.warn("word:delete_phrase_storage_failed", `Storage deletion warning: ${storageError.message}`, { phraseId, audioPath });
      }
    }

    // 2. DBレコードの削除
    const { error: dbError } = await supabase
      .from('com_m_phrase')
      .delete()
      .eq('phrase_id', phraseId);

    if (dbError) {
      logger.error('word:delete_phrase_db_failed', dbError.message, { phraseId });
      throw dbError;
    }

    logger.info('word:delete_phrase_success', `Phrase deleted`, { 
      payload: { phraseId, audioPath } 
    });

    return { success: true };
  } catch (error: any) {
    logger.error("word:delete_phrase_unexpected", error instanceof Error ? error.message : 'Unknown error', { phraseId, audioPath });
    return { success: false, message: error instanceof Error ? error.message : '予期せぬエラーが発生しました' };
  }
}

/**
 * 単語とフレーズの一括Upsert
 */
export async function bulkUpsertWordsAndPhrases(contentId: string, payload: any[]) {
  try {
    const supabase = createAdminClient();

    // 1. 単語の Upsert
    // content_id と word_en の組み合わせで競合判定を行います。
    // ※ DB側に UNIQUE(content_id, word_en) の制約がある前提です。
    const wordPromises = payload.map(async (item) => {
      const { data: word, error: wordError } = await supabase
        .from('com_m_word')
        .upsert({
          content_id: contentId,
          word_en: item.word_en,
          word_ja: item.word_ja,
          frequency_rank: item.frequency_rank,
          status: 'live',
          update_date: new Date().toISOString(),
          // insert_date は upsert だと既存行に干渉するため、省略するか、
          // 既存チェックを厳密にする必要があります。
        }, { onConflict: 'content_id,word_en' })
        .select('word_id')
        .single();

      if (wordError) {
        logger.error('word:bulk_upsert_word_failed', wordError.message, { contentId, item });
        throw wordError;
      }
      return { word_id: word.word_id, phrases: item.phrases };
    });

    // すべての単語のUpsertが終わるのを待つ（ここで各 word_id が確定する）
    const results = await Promise.all(wordPromises);

    // 2. フレーズの更新（既存削除 -> 新規投入）
    const wordIds = results.map(r => r.word_id);
    
    // 対象となる単語の既存フレーズを一括削除
    const { error: deleteError } = await supabase
      .from('com_m_phrase')
      .delete()
      .in('word_id', wordIds);

    if (deleteError) {
      logger.error('word:bulk_upsert_delete_phrases_failed', deleteError.message, { wordIds });
      throw deleteError;
    }

    // 全フレーズをフラットな配列に変換
    const allPhrasesToInsert = results.flatMap((res) => {
      return res.phrases.map((p: any, index: number) => ({
        word_id: res.word_id, // ここが null だと今回のエラーになります
        phrase_en: p.phrase_en,
        phrase_ja: p.phrase_ja,
        phrase_type: p.phrase_type,
        seq_no: index + 1,
        status: 'live',
        insert_date: new Date().toISOString(),
        update_date: new Date().toISOString(),
      }));
    });

    // フレーズが存在する場合のみ一括インサート
    if (allPhrasesToInsert.length > 0) {
      const { error: phraseError } = await supabase
        .from('com_m_phrase')
        .insert(allPhrasesToInsert);
      
      if (phraseError) {
        logger.error('word:bulk_upsert_insert_phrases_failed', phraseError.message, { contentId });
        throw phraseError;
      }
    }

    logger.info('word:bulk_upsert_success', `Bulk upsert completed for content: ${contentId}`, { 
      payload: { contentId, wordCount: results.length, phraseCount: allPhrasesToInsert.length } 
    });

    revalidatePath(`/contents/${contentId}/words`);
    return { success: true };

  } catch (err: any) {
    logger.error("word:bulk_upsert_unexpected", err instanceof Error ? err.message : 'Unknown error', { contentId });
    return { 
      success: false, 
      message: "予期せぬエラーが発生しました" 
    };
  }
}