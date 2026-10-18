// src/types/contract.ts

export interface ContractLicenseStats {
  contract_id: string;
  current_assigned_count: number; // 割当済み総数
  current_active_count: number; // 現在有効な（期間内かつstatus=1）数
  remaining_licenses: number; // 割当可能数
}

import type { TableRow, ViewRow } from './db';

// 契約タイプ 1: Blueprintのみ, 2: Blueprint+ライブセッション
export type ContractType = 1 | 2;

/** 契約の状態（com_m_contract.status。値は DB の CHECK 制約に従う） */
export type ContractStatus = NonNullable<TableRow<'com_m_contract'>['status']>;

// 契約情報の型定義（ビュー vw_contract_details の1行）
export type ContractDetail = ViewRow<'vw_contract_details'>;

// 契約プランマスタ（com_m_contract_plan）
export interface ContractPlan {
  plan_id: string;
  plan_code: string;
  plan_name: string;
  plan_name_en: string;
  contract_type: ContractType;
  weekly_frequency: number | null;
  period_months: number;
  total_sessions: number | null;
  has_dialogue_practice: boolean;
  sort_no: number;
  is_active: boolean; // 販売中（契約の作成で選択肢に出す）
}

// ライセンス割当画面で表示するためのユーザー簡略情報
export interface LicenseUserItem {
  id: string;
  user_name: string | null;
  /** 退会済み（認証のアカウントを消したユーザー）は null */
  email: string | null;
  // 割当済みの場合のみ設定されるライセンスID（無効化操作に使用）
  license_id?: string | null;
  // 割当済みの場合のみ設定されるライセンスステータス（1:有効 0:無効化済み）
  license_status?: number;
  // ライブセッション付き契約の場合のみ設定されるチケット消化状況
  ticket?: {
    total_sessions: number;
    used_sessions: number;
  } | null;
}

// 割当詳細（既存の割当状態を確認するため）
export interface UserLicenseAssignment {
  user_id: string;
  status: number;
  start_date: string;
  end_date: string;
}
