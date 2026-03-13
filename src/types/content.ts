export interface ContentTag {
  id: string;
  label: string;
}

// 型定義（インターフェース）
export interface ContentRecord {
  content_id: string;
  content_name: string;
  content_type: number;
  description: string;
  content_label: string;
  seq_no: number;
  difficulty_level: number;
  recommend: number;
  metadata: {
      tags?: ContentTag[];
      [key: string]: unknown; // 他の動的なプロパティを許容
  };
  insert_date: string;
  is_favorite: boolean;
}

// 型定義（インターフェース）
export interface FavoriteContentRecord {
  content_id: string;
  content_name: string;
  content_type: number;
  description: string;
  content_label: string;
  seq_no: number;
  difficulty_level: number;
  recommend: number;
  metadata: {
      tags?: ContentTag[];
      [key: string]: unknown; // 他の動的なプロパティを許容
  };
  insert_date: string;
  is_favorite: boolean;
}
