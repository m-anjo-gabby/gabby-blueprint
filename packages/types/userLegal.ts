/**
 * ----------------------------------------------
 * ユーザーの正式な情報(com_m_user_legal) 型定義
 * ----------------------------------------------
 * 書面（支払通知書・請求書・トレーニングレポート）に載せる正式な氏名。生徒・コーチ共通。
 * first / last は書く順番ではなく「名・姓」の意味（山田 太郎 → last_name = 山田、first_name = 太郎）。
 * 書面への表示は formatLegalName()（packages/lib/userLegal/formatLegalName.ts）で並べる。
 */

/** 姓・名それぞれの最大文字数（DBの CHECK 制約と同じ） */
export const LEGAL_NAME_MAX_LENGTH = 100;

/** 正式な氏名 */
export interface LegalName {
  /** 姓（姓の無い名前の人は null） */
  last_name: string | null;
  /** 名（ミドルネームを含む） */
  first_name: string;
  /** 姓のローマ字表記（任意） */
  last_name_latin: string | null;
  /** 名のローマ字表記（任意） */
  first_name_latin: string | null;
}

/** 正式な氏名を書く書面の言語（日本語は「姓 名」、英語は「名 姓」で並べる） */
export type LegalNameLocale = 'ja' | 'en';
