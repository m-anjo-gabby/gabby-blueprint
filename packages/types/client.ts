// packages/types/client.ts

/**
 * ClientRecord: DBの完全な定義
 */
export type ClientRecord = {
  client_id: string;
  client_name: string;
  client_type: number;
  industry_type: number;
  delete_flg: string;
  insert_date: string;
  update_date: string;
};

/**
 * Client: アプリ内で扱う標準的な顧客型
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