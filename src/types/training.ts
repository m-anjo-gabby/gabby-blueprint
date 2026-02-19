// src/types/training.ts

// 共通のメタデータベース（拡張用）
export interface BaseResumeMetadata {
  [key: string]: unknown;
}

// 単語帳に特化したメタデータ
export interface WordResumeMetadata extends BaseResumeMetadata {
  phrase_id: string;
  word_id: string;
  last_index?: number;
}

// ビデオに特化したメタデータ（将来用）
export interface VideoResumeMetadata extends BaseResumeMetadata {
  video_id: string;
  video_time: number;
}

// コーパス再開情報の共通レスポンス型
// デフォルトで BaseResumeMetadata を使うように設定
export interface ResumeCorpusResponse<T = BaseResumeMetadata> {
  corpus_id: string;
  item_id: string;
  metadata: T; // 動的に指定
  com_m_corpus: {
    corpus_name: string;
    corpus_type: number;
    difficulty_level: number;
    corpus_label: string;
  };
}