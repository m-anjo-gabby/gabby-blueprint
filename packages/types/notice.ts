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

// 重要お知らせバッジ定義
export const NOTICE_IMPORTANT_BADGE = {
  label: '重要',
  badgeClass: 'bg-rose-50 text-rose-600 border-rose-100',
} as const;


// 配信対象タイプ
export type NoticeTargetType = 'ALL' | 'CLIENT';

/**
 * 添付ファイル情報（JSONB格納形式）
 * Supabase Storage の notice バケットに格納
 */
export interface NoticeAttachment {
  id: string;           // UUID
  name: string;         // ファイル名 (例: 2026_Summer_Campaign.pdf)
  path: string;         // Storageパス (例: notices/202607/e3a1f4b2.pdf)
  size: number;         // バイト数
  mime_type: string;    // MIMEタイプ (例: application/pdf)
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
  show_dialog: boolean;
  title: string;
  content: string;
  attachments: NoticeAttachment[];
  published_at: string;    // UTC ISO文字列
  expired_at: string | null;
  is_published: boolean;
  delete_flg: string;
  insert_date: string;
  update_date: string;
  // 結合フィールド
  is_read: boolean;        // com_t_notice_read から結合
}
