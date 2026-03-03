// src/actions/adminUserAction.ts

import { createAdminClient } from "@/lib/admin";
import { UserRecord } from "@/types/user";

export async function getUsersWithClient(clientId?: string): Promise<UserRecord[]> {
  const supabase = await createAdminClient();

  let query = supabase
    .from('com_m_user')
    .select(`
      user_id,
      user_name,
      user_type,
      client_id,
      com_m_client(client_id, client_name, client_type, industry_type)
    `);

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;
  if (error) throw error;

  // 1. 一度 unknown に変換してから User[] にキャストする
  const rawData = data as unknown;
  
  // 2. もし com_m_client が配列で返ってくる形式なら、マッピングして平坦化
  return (rawData as UserRecord[]).map((user) => ({
    ...user,
    // 必要であればここで複雑なオブジェクト構造を正規化
    com_m_client: Array.isArray(user.com_m_client) 
      ? user.com_m_client[0] 
      : user.com_m_client
  }));

}