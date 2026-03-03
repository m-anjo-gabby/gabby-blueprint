import { createAdminClient } from '@/lib/admin';

export async function getClients() {
  const supabase = await createAdminClient();

  // 必要なカラムのみを取得して通信量を削減
  const { data, error } = await supabase
    .from('com_m_client')
    .select('client_id, client_name')
    .eq('delete_flg', '0') // 論理削除されていないものを対象
    .order('client_name');

  if (error) {
    console.error('Error fetching clients:', error);
    return [];
  }

  return data || [];
}