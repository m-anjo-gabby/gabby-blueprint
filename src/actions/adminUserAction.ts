// src/actions/adminUserAction.ts
'use server';

import { createAdminClient } from "@/lib/admin";
import { UserRecord } from "@/types/user";

export async function getUsersWithClient(
  clientId?: string,
  page: number = 1,
  pageSize: number = 10
): Promise<{ users: UserRecord[]; totalCount: number }> {
  const supabase = await createAdminClient();

  // 1. 範囲の計算
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 2. クエリの作成（count: 'exact' を追加して全件数を取得）
  let query = supabase
    .from('vw_user_list')
    .select('*', { count: 'exact' })
    .order('user_id', { ascending: true })
    .range(from, to); // 取得範囲を指定

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    users: data as UserRecord[],
    totalCount: count || 0
  };
}

/**
 * ユーザー招待アクション
 * ユーザーを作成し、パスワード設定用の招待メールを送信します。
 * パスワードはユーザー自身が設定するため、サーバー側での固定値管理は不要です。
 */
export async function createUser(
  email: string,
  user_name: string,
  client_id: string,
  user_type: string
) {
  const supabase = await createAdminClient();

  // 招待メールを送信し、アカウントを作成
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    // ユーザーがリンクをクリックした際の遷移先（パスワード設定画面）
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/invite`,
    // DB反映に必要なパラメータをメタデータに含める
    data: { 
      user_name,
      user_type,
      client_id
    }
  });

  if (error) throw error;

  return { success: true, userId: data.user.id };
}

/**
 * ユーザー再招待招待アクション
 * パスワード設定用の招待メールを再送信します。
 */
export async function resendInvite(email: string) {
  const supabase = await createAdminClient();
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/invite`,
  });
  if (error) throw error;
  return { success: true };
}