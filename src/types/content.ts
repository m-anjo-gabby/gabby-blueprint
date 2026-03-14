// --- 1. 定数・区分値
export const TAG_TYPES = {
  industry: { label: '業界', color: 'blue' },
  scene: { label: 'シチュエーション', color: 'purple' },
  skill: { label: 'スキル', color: 'emerald' },
  level: { label: 'レベル', color: 'orange' },
  other: { label: 'その他', color: 'glay' },
} as const;

// 定数から型を生成 (industry | scene | skill | level | other)
export type TagType = keyof typeof TAG_TYPES;

// --- 2. データ構造の定義

/** タグマスタ */
export interface ContentTag {
  tag_id: string;
  tag_name: string;
  tag_type: TagType;
  seq_no: number;
  delete_flg: '0' | '1';
  insert_date: string;
  update_date: string;
}

/** メタデータ埋め込み用タグ */
export interface MetadataTag {
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
      tags?: MetadataTag[];
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
      tags?: MetadataTag[];
      [key: string]: unknown; // 他の動的なプロパティを許容
  };
  insert_date: string;
  is_favorite: boolean;
}
