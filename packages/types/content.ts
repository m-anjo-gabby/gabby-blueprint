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
 * CEFRレベル定義
 * 色分けは Tailwind のカラークラス名を指定
 */
export const CEFR_CONFIG = {
  'A1': { id: 'a1', label: 'A1', color: 'blue',  description: 'Beginner' },
  'A2': { id: 'a2', label: 'A2', color: 'cyan',  description: 'Elementary' },
  'B1': { id: 'b1', label: 'B1', color: 'emerald', description: 'Intermediate' },
  'B2': { id: 'b2', label: 'B2', color: 'lime',   description: 'Upper Intermediate' },
  'C1': { id: 'c1', label: 'C1', color: 'orange', description: 'Advanced' },
  'C2': { id: 'c2', label: 'C2', color: 'rose',   description: 'Proficiency' },
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

// CEFRの型定義
export type CefrLevel = keyof typeof CEFR_CONFIG;

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

// メタデータ埋め込み用タグ
export interface MetadataTag {
  id: string;
  label: string;
}

// メタデータ埋め込み用CEFR
export interface MetadataCefr {
  id: string;
  label: string;
  color?: string; // 後の変更に備えて色も保持可能にしておく
}

// メタデータ埋め込み用スプリント
export interface MetadataSprint {
  sprint_type: string; // '0':汎用スプリント, '1':コーパススプリント
}

// ContentRecord の metadata 型を具体化
export interface ContentMetadata {
  tags?: MetadataTag[];
  cefr?: MetadataCefr; // CEFRを追加
  sprint?: MetadataSprint;
  [key: string]: unknown;
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
  metadata: ContentMetadata;
  delete_flg: '0' | '1';
  insert_date: string;
  update_date: string;
}

// 教材の型定義
export interface Content extends ContentRecord {
  tags?: ContentTagSummary[];
  access_clients?: ContentAccessSummary[];
}

/**
 * 生徒用：表示用のコンテンツ型
 * RLSによりアクセス権があるもののみが返ってくることを前提としています
 */
export interface ContentItem extends Omit<ContentRecord, 'metadata'> {
  // DBリレーションから取得するタグ情報
  display_tags: ContentTagSummary[];
  // お気に入り状態
  is_favorite: boolean;
  // メタデータ（必要に応じて。基本はdisplay_tagsを優先）
  metadata: ContentMetadata;
}

// お気に入りリスト用も共通の型を使用（一貫性を保つため）
export type FavoriteContentItem = ContentItem;

/**
 * ライブラリ画面のタブ定義を CONTENT_TYPES から動的に生成
 * Object.values を使うことで、定義が増えても自動で反映
 */
export const LIBRALY_TABS = [
  { id: 'All', label: 'すべて' },
  ...Object.values(CONTENT_TYPES).map(type => ({
    id: String(type.value), // Tabsのvalueはstringが扱いやすいため
    label: type.label
  }))
];