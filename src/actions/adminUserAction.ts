// src/actions/adminUserAction.ts

import { createAdminClient } from "@/lib/admin";
import { UserRecord } from "@/types/user";

export async function getUsersWithClient(clientId?: string): Promise<UserRecord[]> {
  const supabase = await createAdminClient();

  // ユーザリストビューを参照
  let query = supabase
    .from('vw_user_list')
    .select('*')
    .order('user_id', { ascending: true });;

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return data as UserRecord[];

}