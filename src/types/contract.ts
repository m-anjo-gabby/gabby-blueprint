// src/types/contract.ts

export interface ContractLicenseStats {
  contract_id: string;
  current_assigned_count: number; // 割当済み総数
  current_active_count: number;   // 現在有効な（期間内かつstatus=1）数
}

export interface ContractInfo {
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
  
  // リレーション先の型
  com_m_client: {
    client_name: string;
  } | null;

  // 追加：統計情報（マージした後に付与される）
  stats?: ContractLicenseStats | null;
}

// ライセンス割当画面で表示するためのユーザー簡略情報
export interface LicenseUserItem {
  id: string;
  user_name: string;
  email: string;
}

// 割当詳細（既存の割当状態を確認するため）
export interface UserLicenseAssignment {
  user_id: string;
  status: number;
  start_date: string;
  end_date: string;
}