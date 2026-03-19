'use server';

import { createAdminClient } from "@/lib/admin";
import { PhraseRecord, WordRecord } from '@/types/word';
import { revalidatePath } from 'next/cache';

/**
 * 特定の教材に紐づく単語一覧を取得する
 */
export async function getWordsByContentId(contentId: string): Promise<WordRecord[]> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from('com_m_word')
      .select('*')
      .eq('content_id', contentId)
      .order('frequency_rank', { ascending: true }); // 頻出度のランク昇順

    if (error) {
      console.error('Error fetching words:', error);
      return [];
    }

    return data as WordRecord[];
  } catch (err) {
    console.error('System error:', err);
    return [];
  }
}

/**
 * 単語の登録または更新 (Upsert)
 */
export async function upsertWord(payload: Partial<WordRecord>) {
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

  if (isEdit) {
    // 更新
    const { error: updateError } = await supabase
      .from('com_m_word')
      .update(wordData)
      .eq('word_id', payload.word_id as string);
    error = updateError;
  } else {
    // 新規登録
    const { error: insertError } = await supabase
      .from('com_m_word')
      .insert([{ 
        ...wordData, 
        insert_date: new Date().toISOString() 
      }]);
    error = insertError;
  }

  if (error) {
    console.error("Upsert Word Error:", error);
    return { 
      success: false, 
      message: error.message || "データベース操作に失敗しました" 
    };
  }

  // キャッシュの更新（管理画面のパスを指定）
  revalidatePath('/admin/contents/[id]/words', 'page');

  return { success: true };
}

/**
 * 単語の物理削除（関連するStorage内の音声ファイルも含む）
 */
export async function deleteWord(wordId: string) {
  const supabase = createAdminClient();

  try {
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
        console.error("Storage Cleanup Error (non-critical):", removeError);
      }
    }

    // 3. DBから単語を削除
    // ※ 外部キー制約 (ON DELETE CASCADE) により、com_m_phrase のレコードも自動で消えます
    const { error: dbError } = await supabase
      .from('com_m_word')
      .delete()
      .eq('word_id', wordId);

    if (dbError) throw dbError;
    
    return { success: true };

  } catch (error: any) {
    console.error("Delete Word Error:", error);
    return { 
      success: false, 
      message: error.message || "単語の削除処理に失敗しました" 
    };
  }
}

/**
 * 特定の単語に紐づくフレーズ一覧を取得する
 */
export async function getPhrasesByWordId(wordId: string): Promise<PhraseRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('com_m_phrase')
    .select('*')
    .eq('word_id', wordId)
    .order('seq_no', { ascending: true });

  if (error) {
    console.error('Error fetching phrases:', error);
    return [];
  }
  return data as PhraseRecord[];
}

/**
 * フレーズの登録または更新 (Upsert)
 */
export async function upsertPhrase(payload: Partial<PhraseRecord>) {
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
  if (isEdit) {
    const { error: updateError } = await supabase
      .from('com_m_phrase')
      .update(phraseData)
      .eq('phrase_id', payload.phrase_id as string);
    error = updateError;
  } else {
    const { error: insertError } = await supabase
      .from('com_m_phrase')
      .insert([{ ...phraseData, insert_date: new Date().toISOString() }]);
    error = insertError;
  }

  if (error) {
    console.error("Upsert Phrase Error:", error);

    // ユニーク制約違反 (コード: 23505) のハンドリング
    if (error.code === '23505') {
      return { 
        success: false, 
        message: "表示順 (Seq No) が重複しています。別の数値を入力してください。" 
      };
    }

    return { success: false, message: error.message };
  }

  revalidatePath('/admin/contents/[id]/words', 'page');
  return { success: true };
}

/**
 * フレーズの物理削除（音声ファイルも含む）
 */
export async function deletePhrase(phraseId: string, wordId: string) {
  const supabase = createAdminClient();

  try {
    // 1. Storageから該当する音声ファイルを削除
    const filePath = `words/${wordId}/phrases/${phraseId}.mp3`;
    
    // removeは配列を受け取るため、ファイルが存在しない場合もエラーにはならないが、ログ出力をしておく
    const { error: storageError } = await supabase.storage
      .from('audio')
      .remove([filePath]);

    if (storageError) {
      console.warn("Storage deletion warning:", storageError);
    }

    // 2. DBレコードの削除
    const { error: dbError } = await supabase
      .from('com_m_phrase')
      .delete()
      .eq('phrase_id', phraseId);

    if (dbError) throw dbError;

    return { success: true };
  } catch (error: any) {
    console.error("Delete Phrase Error:", error);
    return { success: false, message: error.message };
  }
}

/**
 * 単語とフレーズの一括Upsert
 */
export async function bulkUpsertWordsAndPhrases(contentId: string, payload: any[]) {
  const supabase = createAdminClient();

  try {
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

      if (wordError) throw wordError;
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

    if (deleteError) throw deleteError;

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
      
      if (phraseError) throw phraseError;
    }

    revalidatePath(`/admin/contents/${contentId}/words`);
    return { success: true };

  } catch (err: any) {
    console.error("Bulk Upsert Error:", err);
    return { 
      success: false, 
      message: err.message || "データの保存中にエラーが発生しました" 
    };
  }
}