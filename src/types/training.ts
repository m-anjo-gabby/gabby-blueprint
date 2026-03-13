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

// コンテンツ再開情報の共通レスポンス型
// デフォルトで BaseResumeMetadata を使うように設定
export interface ResumeContentResponse<T = BaseResumeMetadata> {
  content_id: string;
  item_id: string;
  metadata: T; // 動的に指定
  com_m_contents: {
    content_name: string;
    content_type: number;
    difficulty_level: number;
    content_label: string;
  };
}