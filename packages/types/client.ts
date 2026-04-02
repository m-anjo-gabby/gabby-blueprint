// packages/types/client.ts

/**
 * ClientRecord: com_m_client テーブルの完全な定義 (Entity)
 */
export type ClientRecord = {
  client_id: string;
  client_name: string;
  client_type: number;   // 0: 初期テナント 1:法人, 2:個人
  industry_type: number; // 業界種別
  delete_flg: string;
  insert_date: string;
  update_date: string;
};

/**
 * Client: アプリケーション内で一般的に利用する顧客情報の最小単位
 */
export interface Client {
  client_id: string;
  client_name: string;
  client_type: number;
  industry_type: number;
}

/**
 * ClientOption: フィルターやセレクトボックス選択肢用の軽量型
 * getClientsFilter の戻り値に対応
 */
export type ClientOption = Pick<Client, 'client_id' | 'client_name'>;

/**
 * ClientPayload: 登録・更新時の入力データ型
 */
export interface ClientPayload {
  client_name: string;
  client_type: number;
  industry_type: number;
}

/**
 * ClientResponse: サーバーアクションの共通戻り値型
 */
export interface ClientResponse {
  success: boolean;
  message?: string;
  client?: ClientRecord;
}