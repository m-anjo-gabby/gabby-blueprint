import type { SupabaseClient } from '@supabase/supabase-js';
import type { MailLocale } from '../layout/document';
import type { RenderedEmail } from '../render';
import type { NotifyMailLinks } from '../templates/notifyMail';
import type { MailType } from './registry';

/** com_t_mail_outbox の行（送信処理が確保したもの） */
export interface MailOutboxRow {
  mail_id: string;
  user_id: string;
  mail_type: string;
  category: string;
  dedup_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  /** 送信待ちに積んだ日時（期限切れの判定に使う） */
  insert_date: string;
}

/** 宛先（com_m_user と auth.users から組み立てる） */
export interface MailRecipient {
  userId: string;
  email: string;
  userType: string;
  userName: string | null;
  timezone: string;
  /** ライセンスの有無（auth.users の app_metadata.is_licensed。生徒だけが持つ） */
  isLicensed: boolean;
  /** 文面の言語（生徒: 日本語 / コーチ: 英語。管理者は送信処理が送らない。policy.ts の resolveRecipientLanguage） */
  language: MailLocale;
}

/**
 * 宛先のポータルへのリンク（送信処理が宛先・区分から組み立てて渡す。ポータルの URL・鍵が未設定の環境では null）。
 * 設定画面・配信停止の URL（NotifyMailLinks）は、そのままテンプレートの links に渡す。
 */
export interface MailLinks extends NotifyMailLinks {
  /** 宛先のポータルの画面の URL（例: portal('/live-room')） */
  portal: (path: string) => string | null;
}

/** 種別ごとの組み立て結果（templates/ の build〜Mail の結果を renderMail したもの）。送る必要が無くなった場合は skip に理由を入れる */
export type MailBuildResult = { skip: string } | RenderedEmail;

/**
 * 種別ごとの組み立て処理（送る直前に最新の業務データを読み、送るかどうかと文面を決める）。
 * 宛先の確認（退会・ライセンス・配信停止・管理者）・言語・リンクは送信処理が済ませて渡すため、組み立て処理は
 * 「業務データを読む → 送るかどうか決める → 文面を作る」だけを行う。
 */
export type MailHandler = (params: {
  admin: SupabaseClient;
  row: MailOutboxRow;
  recipient: MailRecipient;
  nowMs: number;
  links: MailLinks;
}) => Promise<MailBuildResult>;

export type MailHandlerRegistry = Record<MailType, MailHandler>;
