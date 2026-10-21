/**
 * ----------------------------------------------
 * お知らせ機能 型定義
 * ----------------------------------------------
 */

// お知らせ種別
export const NOTICE_TYPES = {
  INFO: {
    label: 'お知らせ',
    color: 'blue',
    badgeClass: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  CAMPAIGN: {
    label: 'キャンペーン',
    color: 'amber',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  MAINTENANCE: {
    label: 'メンテナンス',
    color: 'slate',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  UPDATE: {
    label: 'アップデート',
    color: 'violet',
    badgeClass: 'bg-violet-50 text-violet-600 border-violet-100',
  },
} as const;

export type NoticeType = keyof typeof NOTICE_TYPES;

/** 画面・URL から受け取った値がお知らせ種別か */
export function isNoticeType(value: unknown): value is NoticeType {
  return typeof value === 'string' && Object.hasOwn(NOTICE_TYPES, value);
}

// 重要お知らせバッジ定義
export const NOTICE_IMPORTANT_BADGE = {
  label: '重要',
  badgeClass: 'bg-rose-50 text-rose-600 border-rose-100',
} as const;

// 表示方法（POPUP: ホームを開いた時にポップアップ / HOME: ホームのカード（生徒のみ） / LIST: お知らせ一覧のみ）
export const NOTICE_DISPLAY_MODES = ['POPUP', 'HOME', 'LIST'] as const;
export type NoticeDisplayMode = (typeof NOTICE_DISPLAY_MODES)[number];

/** 行動ボタンの文言の最大文字数（DB の chk_notice_cta と合わせる） */
export const NOTICE_CTA_LABEL_MAX = 30;

// 配信対象タイプ (ALL: 生徒全体 / CLIENT: 顧客単位 / COACH: コーチ全体)
export type NoticeTargetType = 'ALL' | 'CLIENT' | 'COACH';

/**
 * 添付ファイル情報（JSONB格納形式）
 * Supabase Storage の notice バケットに格納
 */
export interface NoticeAttachment {
  id: string; // UUID
  name: string; // ファイル名 (例: 2026_Summer_Campaign.pdf)
  path: string; // Storageパス (例: notices/202607/e3a1f4b2.pdf)
  size: number; // バイト数
  mime_type: string; // MIMEタイプ (例: application/pdf)
}

/**
 * お知らせマスタ（com_m_notice）のデータ型
 */
export interface NoticeItem {
  notice_id: string;
  target_type: NoticeTargetType;
  client_id: string | null;
  notice_type: NoticeType;
  is_important: boolean;
  display_mode: NoticeDisplayMode;
  title: string;
  content: string;
  attachments: NoticeAttachment[];
  /** 見出し画像のStorageパス（生徒向けのみ） */
  image_path: string | null;
  /** 行動ボタンの文言・リンク先（生徒向けのみ。両方そろっている場合だけ表示する） */
  cta_label: string | null;
  cta_url: string | null;
  published_at: string; // UTC ISO文字列
  expired_at: string | null;
  is_published: boolean;
  insert_date: string;
  update_date: string;
  // 結合フィールド
  is_read: boolean; // com_t_notice_read から結合
}

/**
 * 管理画面のお知らせ一覧の行（既読の結合は無く、配信先の顧客名を結合する）
 */
export interface AdminNoticeListItem extends Omit<NoticeItem, 'is_read'> {
  client_name: string | null;
}
