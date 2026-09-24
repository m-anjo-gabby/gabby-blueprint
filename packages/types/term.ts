/**
 * ----------------------------------------------
 * 規約管理 型定義
 * ----------------------------------------------
 * - バージョン（com_m_terms）: 同意の単位。再同意が必要な変更は新バージョンとして作成する。
 * - リビジョン（com_m_terms_revision）: 同一バージョン内の文言修正履歴（サイレント更新）。
 *   表示・同意対象の本文は「そのバージョンの最新リビジョン」。
 */

export type TermType = 'TERMS' | 'PRIVACY';

/** 生徒向けに表示・同意させる規約（バージョン＋最新リビジョンの本文） */
export interface TermDocument {
  term_id: string;
  term_type: TermType;
  version_name: string;
  published_date: string;
  /** 本文を表示したリビジョン。リビジョン未登録（データ移行漏れ）の場合のみ null */
  revision_id: string | null;
  content: string;
}

/** 同意記録の対象（同意時点で表示していたリビジョンを併せて記録する） */
export interface TermAgreementTarget {
  term_id: string;
  revision_id: string | null;
}

/** アドミン一覧の1行 */
export interface TermListItem {
  term_id: string;
  term_type: TermType;
  version_name: string;
  is_required: boolean;
  /** JST日付文字列（表示用） */
  published_date: string;
  /** 公開日が未来（公開前）か */
  is_upcoming: boolean;
  /** その種別で現在有効な最新版か */
  is_current: boolean;
}

/** アドミン編集画面のリビジョン履歴 */
export interface TermRevision {
  revision_id: string;
  revision_no: number;
  content: string;
  change_note: string | null;
  insert_user_name: string | null;
  /** JST日時文字列（表示用） */
  insert_date: string;
}

/** アドミン編集画面の表示データ */
export interface TermDetail {
  term_id: string;
  term_type: TermType;
  version_name: string;
  /** 公開済み（公開日が現在以前）か。公開後の修正は修正理由が必須 */
  is_published: boolean;
  /** revision_no 降順（先頭が現行本文） */
  revisions: TermRevision[];
}
