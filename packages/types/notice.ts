/**
 * ----------------------------------------------
 * お知らせ機能 型定義
 * ----------------------------------------------
 */

// お知らせ種別
export const NOTICE_TYPES = {
  INFO:        { label: 'Info',        color: 'blue'   },
  CAMPAIGN:    { label: 'Campaign',    color: 'orange' },
  MAINTENANCE: { label: 'Maintenance', color: 'red'    },
  UPDATE:      { label: 'Update',      color: 'violet' },
} as const;

export type NoticeType = keyof typeof NOTICE_TYPES;

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
