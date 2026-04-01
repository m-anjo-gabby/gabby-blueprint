/**
 * UI（再開カード）で共通して使用する表示用プロパティ
 */
export interface ResumeDisplayData {
  progress_percent: number; // 0-100の進捗率
  position_text: string;    // "Step 5" や "02:45" など、現在の位置を示すラベル
  last_unit_name?: string;  // 最後に学習していたセクション名など
}

/**
 * 単語帳（Word）の再開メタデータ
 */
export interface WordResumeMetadata {
  type: 'word';
  word_id: string;
  phrase_id: string;
  last_index: number;
  display: ResumeDisplayData;
}

/**
 * ビデオ（Video）の再開メタデータ（将来用）
 */
export interface VideoResumeMetadata {
  type: 'video';
  video_id: string;
  video_time: number;
  display: ResumeDisplayData;
}

/**
 * 全ての教材タイプのメタデータUnion型
 */
export type ResumeMetadata = WordResumeMetadata | VideoResumeMetadata;

/**
 * コンテンツ再開情報のレスポンス型
 * metadata内の 'type' フィールドで具体的な型を判別可能
 */
export interface ResumeContentResponse {
  user_id: string;
  content_id: string;
  item_id: string | null;
  metadata: ResumeMetadata; 
  update_date: string;
  com_m_contents: {
    content_name: string;
    content_type: number;
    difficulty_level: number;
    content_label: string;
  };
}