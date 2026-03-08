// src/types/user.ts

export type ClientRecord = {
  client_id: string;
  client_name: string;
  client_type: number;
  industry_type: number;
  logo_url?: string | null;
  dashboard_title?: string | null;
};

export type UserRecord = {
  id: string; // Auth UUID
  user_id: number;
  client_id: string | null;
  user_type: string;
  user_name: string | null;
  area_cd: string;
  locale_id: string;
  email?: string;
  client_name: string | null;
  last_sign_in_at?: string;
  confirmed_at?: string | null;
};

/**
 * 顧客情報の型定義
 */
export interface Client {
  client_id: string;
  client_name: string;
}