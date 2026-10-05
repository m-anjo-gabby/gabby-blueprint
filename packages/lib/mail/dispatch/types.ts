import type { SupabaseClient } from '@supabase/supabase-js';
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
}

/** 宛先（com_m_user と auth.users から組み立てる） */
export interface MailRecipient {
  userId: string;
  email: string;
  userType: string;
  userName: string | null;
  timezone: string;
}

/** 種別ごとの組み立て結果。送る必要が無くなった場合は skip に理由を入れる */
export type MailBuildResult = { skip: string } | { subject: string; html: string };

/** 種別ごとの組み立て処理（送る直前に最新の業務データを読み、送るかどうかと文面を決める） */
export type MailHandler = (params: {
  admin: SupabaseClient;
  row: MailOutboxRow;
  recipient: MailRecipient;
  nowMs: number;
}) => Promise<MailBuildResult>;

export type MailHandlerRegistry = Record<MailType, MailHandler>;
