/**
 * ----------------------------------------------
 * 定数・区分値
 * ----------------------------------------------
 */
export const USER_TYPES = {
  ADMIN: '0',
  STUDENT: '1',
  MONITOR: '2',
} as const;

// 値の型を抽出 ( '0' | '1' | '2' )
export type UserType = typeof USER_TYPES[keyof typeof USER_TYPES];

export const USER_TYPE_MAP: Record<UserType, string> = {
  [USER_TYPES.ADMIN]: '管理者',
  [USER_TYPES.STUDENT]: '生徒',
  [USER_TYPES.MONITOR]: 'モニター',
};

export const getUserTypeLabel = (type: string | null | undefined): string => {
  // type が UserType に該当すればラベルを返し、なければ '不明'
  return USER_TYPE_MAP[type as UserType] ?? '不明';
};

/**
 * ----------------------------------------------
 * 型定義
 * ----------------------------------------------
 */


/**
 * UserBase: ユーザー情報の最小共通単位
 * アプリ全体で「ユーザー」を指す際に必須となる基本フィールド
 */
export interface UserBase {
  id: string;        // auth.users.id (UUID)
  user_id: number;   // com_m_user.user_id (BIGSERIAL)
  user_name: string | null;
  user_type: string; // '1': student, '0': admin 等
  client_id: string | null;
  area_cd: string;
  locale_id: string;
}

/**
 * UserRecord: 表示・一覧用ドメインオブジェクト
 * vw_user_list (View) の全カラムと一致し、
 * ライセンス情報や顧客名を含んだリッチなデータ型
 */
export interface UserRecord extends UserBase {
  email?: string;             // auth.users から取得
  client_name: string | null; // com_m_client から結合
  last_sign_in_at?: string;   // auth.users から取得
  confirmed_at?: string | null;

  // ロール情報
  roles?: string[]; 

  // ライセンス関連 (com_t_user_license 等の結合情報)
  contract_id: string | null;
  license_id: string | null;
  license_status: number | null; // 1:有効, 0:停止, 9:満了
  license_start_date: string | null;
  license_end_date: string | null;
  plan_name: string | null;
  license_state: 'none' | 'active' | 'future' | 'expired';

}

/**
 * CreateUserPayload: 新規登録・招待用
 * createUser アクションの引数や、BulkUserのベースとして使用
 */
export interface CreateUserPayload {
  email: string;
  user_name: string;
  client_id: string;
  user_type: string;
  roles?: string[];
}

/**
 * CreateUserResponse: 登録処理の戻り値規格
 */
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

/**
 * CSV / Bulk Import 関連
 */
export interface RawCsvRow {
  'メールアドレス'?: string;
  'email'?: string;
  '名前'?: string;
  'user_name'?: string;
  '顧客名'?: string;
  'client_name'?: string;
}

export interface BulkUser extends CreateUserPayload {
  client_name: string; // 確認画面での表示用
  isValid: boolean;
  error?: string;
}

export interface BulkImportResultDetail {
  id?: string;
  email: string;
  status: 'success' | 'error';
  message?: string;
}

export interface BulkImportResponse {
  success: boolean;
  total: number;
  successCount: number;
  errorCount: number;
  details: BulkImportResultDetail[];
}

/**
 * RoleDefinition: マスタ選択用
 * com_m_role から取得するデータの型
 */
export interface RoleDefinition {
  role_id: string;
  role_name: string;
  target_user_type: string | null; // NULL（共通ロール）を許容
  seq_no: number;
}
