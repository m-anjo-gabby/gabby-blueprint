// src/types/user.ts

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

  // ライセンス関連（ビューから取得）
  contract_id: string | null;
  license_id: string | null;
  license_status: number | null;
  license_end_date: string | null;
  plan_name: string | null;
};

/**
 * 顧客情報の型定義
 */
export interface Client {
  client_id: string;
  client_name: string;
}

// CSVから直接読み込まれる生データの型（文字列のみ）
export interface RawCsvRow {
  'メールアドレス'?: string;
  'email'?: string;
  '名前'?: string;
  'user_name'?: string;
  '顧客名'?: string;
  'client_name'?: string;
}

// バリデーション済みのインポート用レコード
export interface BulkUser {
  email: string;
  user_name: string;
  user_type: string;
  client_id: string;
  client_name: string; // 表示用
  isValid: boolean;
  error?: string;
}

// 成功時と失敗時で型を分けることで、result.success === true の時に user_id が存在することを保証します
export type CreateUserResponse = 
  | { 
      success: true; 
      user_id: string; 
      errorType: null; 
      message: null; 
    }
  | { 
      success: false; 
      user_id: null; 
      errorType: string; 
      message: string; 
    };

export interface BulkImportResultDetail {
  id?: string;        // 成功時のみ存在
  email: string;
  status: 'success' | 'error';
  message?: string;   // 失敗時の理由
}

export interface BulkImportResponse {
  success: boolean;
  total: number;
  successCount: number;
  errorCount: number;
  details: BulkImportResultDetail[];
}