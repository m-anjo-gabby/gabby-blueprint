// src/types/contract.ts

export interface ContractLicenseStats {
  contract_id: string;
  current_assigned_count: number; // 割当済み総数
  current_active_count: number;   // 現在有効な（期間内かつstatus=1）数
  remaining_licenses: number;     // 割当可能数
}

// 契約タイプ 1: Blueprintのみ, 2: Blueprint+ライブセッション
export type ContractType = 1 | 2;

// 契約情報の型定義（ビュー vw_contract_details に対応）
export interface ContractDetail {
  contract_id: string;
  client_id: string;
  plan_name: string;
  max_licenses: number;
  start_date: string;
  end_date: string;
  status: number;
  note: string | null;
  insert_date: string;
  update_date: string;
  client_name: string;
  remaining_licenses: number;
  current_assigned_count: number;
  current_active_count: number;
  contract_type: ContractType;
  plan_id: string | null;
  weekly_frequency: number | null;
  total_sessions: number | null;
}

// 契約プランマスタ（com_m_contract_plan）
export interface ContractPlan {
  plan_id: string;
  plan_code: string;
  plan_name: string;
  contract_type: ContractType;
  weekly_frequency: number | null;
  period_months: number;
  total_sessions: number | null;
}

// ライセンス割当画面で表示するためのユーザー簡略情報
export interface LicenseUserItem {
  id: string;
  user_name: string;
  email: string;
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