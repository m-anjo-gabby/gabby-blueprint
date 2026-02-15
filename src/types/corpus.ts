export interface CorpusTag {
  id: string;
  label: string;
}

// 型定義（インターフェース）
export interface CorpusRecord {
  corpus_id: string;
  corpus_name: string;
  corpus_type: number;
  description: string;
  corpus_label: string;
  seq_no: number;
  difficulty_level: number;
  recommend: number;
  metadata: {
      tags?: CorpusTag[];
      [key: string]: unknown; // 他の動的なプロパティを許容
  };
  insert_date: string;
  is_favorite: boolean;
}
