"use server";

import { createClient } from "@/lib/server";
import { TrainingWord } from "@/types/training";

// 1. DBから返ってくる生のデータ構造を定義
interface RawPhraseResponse {
  phrase_id: string;
  phrase_en: string;
  phrase_ja: string;
  phrase_type: number;
  seq_no: number;
}

interface RawWordResponse {
  word_id: string;
  word_en: string;
  word_ja: string;
  com_m_phrase: RawPhraseResponse[];
}

/**
 * 指定されたコーパスIDに紐付く単語とフレーズを取得
 */
export async function getTrainingData(corpusId: string): Promise<TrainingWord[]> {
  const supabase = await createClient();

  // selectの型推論を助けるため、RawWordResponse[] として扱う
  // 子テーブル(com_m_phrase)のソートもselect内で指定可能です
  const { data, error } = await supabase
    .from('com_m_word')
    .select(`
      word_id,
      word_en,
      word_ja,
      com_m_phrase (
        phrase_id,
        phrase_en,
        phrase_ja,
        phrase_type,
        seq_no
      )
    `)
    .eq('corpus_id', corpusId)
    .eq('delete_flg', '0')
    .eq('com_m_phrase.delete_flg', '0') // フレーズ側の削除フラグも考慮
    .order('frequency_rank', { ascending: true }) // com_m_wordのソート
    .order('seq_no', { referencedTable: 'com_m_phrase', ascending: true }); // com_m_phraseのソート

  if (error) {
    console.error("DB Fetch Error:", error.message);
    throw new Error("トレーニングデータの取得に失敗しました。");
  }

  // data を一度 unknown を経由して RawWordResponse[] にキャスト
  const rawData = data as unknown as RawWordResponse[];

  // 3. any を使わずにマッピング
  return rawData.map((word) => ({
    word_id: word.word_id,
    word_en: word.word_en,
    word_ja: word.word_ja,
    // com_m_phrase が配列であることを保証しつつソート
    phrases: [...(word.com_m_phrase || [])].sort((a, b) => a.seq_no - b.seq_no)
  }));
}