// src/types/client.ts

// 顧客データの型定義
export type ClientRecord = {
  client_id: string;
  client_name: string;
  client_type: number;
  industry_type: number;
  insert_date: string;
};