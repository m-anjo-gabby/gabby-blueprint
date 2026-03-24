/**
 * ----------------------------------------------
 * 定数・区分値
 * ----------------------------------------------
 */
// コンテンツ種別
export const CONTENT_TYPES = {
  0: { label: '単語帳', value: 0 },
  1: { label: 'ビデオ', value: 1 },
  2: { label: 'スプリント', value: 2 },
} as const;

// タグ種別
export const TAG_TYPES = {
  industry: { label: '業界', color: 'blue' },
  scene: { label: 'シチュエーション', color: 'purple' },
  skill: { label: 'スキル', color: 'emerald' },
  level: { label: 'レベル', color: 'orange' },
  other: { label: 'その他', color: 'glay' },
} as const;

// 公開範囲
export const CONTENT_SCOPES = {
  0: { label: '共通', value: 0 },
  1: { label: '限定', value: 1 },
  9: { label: '非公開', value: 9 },
} as const;

/**
 * ----------------------------------------------
 * データ構造の定義
 * ----------------------------------------------
 */
// コンテンツ種別の型定義
export type ContentType = keyof typeof CONTENT_TYPES;

// タグ種別の型定義
export type TagType = keyof typeof TAG_TYPES;

// 公開範囲の型定義
export type ContentScope = keyof typeof CONTENT_SCOPES;

// タグマスタの型定義
export interface ContentTag {
  tag_id: string;
  tag_name: string;
  tag_type: TagType;
  seq_no: number;
  delete_flg: '0' | '1';
  insert_date: string;
  update_date: string;
}

// 教材に関連付いたタグの簡易型
export interface ContentTagSummary {
  tag_id: string;
  tag_name: string;
  tag_type: string;
}

// クライアント割当の簡易型
export interface ContentAccessSummary {
  client_id: string;
  client_name: string;
}

// DBレコード型 (com_m_contents)
export interface ContentRecord {
  content_id: string;
  content_name: string;
  content_type: ContentType;
  content_scope: ContentScope;
  content_label: string;
  description: string | null;
  seq_no: number;
  difficulty_level: number;
  recommend: number;
  metadata: {
    tags?: MetadataTag[];
    [key: string]: unknown;
  };
  delete_flg: '0' | '1';
  insert_date: string;
  update_date: string;
}

// 教材の型定義
export interface Content extends ContentRecord {
  tags?: ContentTagSummary[];
  access_clients?: ContentAccessSummary[];
}

// メタデータ埋め込み用タグ
export interface MetadataTag {
  id: string;
  label: string;
}

/**
 * 生徒用：ライブラリ表示用のコンテンツ型
 * RLSによりアクセス権があるもののみが返ってくることを前提としています
 */
export interface ContentItem extends Omit<ContentRecord, 'metadata'> {
  // DBリレーションから取得するタグ情報
  display_tags: ContentTagSummary[];
  // お気に入り状態
  is_favorite: boolean;
  // メタデータ（必要に応じて。基本はdisplay_tagsを優先）
  metadata: {
    tags?: MetadataTag[];
    [key: string]: unknown;
  };
}

// お気に入りリスト用も共通の型を使用（一貫性を保つため）
export type FavoriteContentItem = ContentItem;

/**
 * ライブラリ画面のタブ定義を CONTENT_TYPES から動的に生成
 * Object.values を使うことで、定義が増えても自動で反映
 */
export const TABS = [
  { id: 'All', label: 'すべて' },
  ...Object.values(CONTENT_TYPES).map(type => ({
    id: String(type.value), // Tabsのvalueはstringが扱いやすいため
    label: type.label
  }))
];