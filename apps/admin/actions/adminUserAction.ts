'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { 
  UserRecord, 
  CreateUserPayload, 
  CreateUserResponse, 
  BulkUser, 
  BulkImportResponse, 
  BulkImportResultDetail, 
  RoleDefinition
} from "@gabby/types/user";
import { formatToJstDate } from "@gabby/lib/date/date";
import { revalidatePath } from "next/cache";

/**
 * ユーザ情報の一覧取得（ページネーション・検索対応）
 */
export async function getUsers(
  page: number = 1,
  pageSize: number = 10,
  searchQuery?: string,
  clientId?: string
): Promise<{ users: UserRecord[]; totalCount: number }> {
  const supabase = createAdminClient();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .schema('private') // privateスキーマを指定
    .from('vw_user_list')
    .select('*', { count: 'exact' });

  // 1. 検索キーワードがある場合（ユーザー名、メール、顧客名を横断検索）
  if (searchQuery) {
    // .or() を使って、複数のカラムのいずれかにヒットすればOKとする
    query = query.or(`user_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,client_name.ilike.%${searchQuery}%`);
  };

  // 2. 顧客IDが指定されている場合（特定の顧客で絞り込む必要がある場合のみ）
  if (clientId) {
    query = query.eq('client_id', clientId);
  };

  const { data, error, count } = await query
    .order('user_id', { ascending: true })
    .range(from, to);

  if (error) throw error;

  // DB(UTC) -> UI(JST YYYY-MM-DD) へ変換
  const formattedUsers = (data || []).map((user: UserRecord) => ({
    ...user,
    license_start_date: user.license_start_date ? formatToJstDate(user.license_start_date) : null,
    license_end_date: user.license_end_date ? formatToJstDate(user.license_end_date) : null,
  }));

  return {
    users: formattedUsers as UserRecord[],
    totalCount: count || 0,
  };
}

/**
 * ユーザー登録アクション
 * ユーザーを作成し、パスワード設定用の招待メールを送信します。
 * パスワードはユーザー自身が設定するため、サーバー側での固定値管理は不要です。
 */
export async function createUser(payload: CreateUserPayload & { roles?: string[] }): Promise<CreateUserResponse> {
  const { email, user_name, client_id, user_type, roles = [] } = payload;
  try {
    const supabase = await createAdminClient();

    // 1. 招待メールを送信し、アカウントを作成
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      // ユーザーがリンクをクリックした際の遷移先（パスワード設定画面）
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/invite`,
      // DB反映に必要なパラメータをメタデータに含める
      data: { 
        user_name,
        user_type,
        client_id,
        roles // 初期ロールをメタデータに含める
      }
    });

    if (error) {
      if (error.status === 422 && error.code === 'email_exists') {
        return { success: false, user_id: null, errorType: 'email_exists', message: "登録済みメールです。" };
      }
      return { success: false, user_id: null, errorType: 'unexpected_error', message: error.message };
    }

    const userId = data.user.id;

    // 2. DB側のロール紐付け（新規作成時）
    if (roles.length > 0) {
      await supabase
        .from('com_t_user_role')
        .insert(roles.map(roleId => ({ user_id: userId, role_id: roleId })));
    }

    revalidatePath('/users');
    return { success: true, user_id: userId, errorType: null, message: null };

  } catch (err) {
    console.error("Unexpected Error:", err);
    return { success: false, user_id: null, errorType: 'unexpected_error', message: "通信エラーが発生しました。" };
  }
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
  // 状態（招待中などの表示）が変わる可能性がある
  revalidatePath('/users');
  return { success: true };
}

/**
 * ユーザー更新アクション
 * DB(com_m_user, com_t_user_role)とAuthメタデータを同期します
 */
export async function updateUser(
  id: string,
  payload: CreateUserPayload & { roles?: string[] } // rolesを追加
) {
  const { email, user_name, client_id, user_type, roles = [] } = payload;
  
  try {
    const supabase = await createAdminClient();

    // 1. ユーザロール (com_t_user_role) の更新
    // 一旦削除して入れ直す（最もシンプルな同期方法）
    const { error: roleDeleteError } = await supabase
      .from('com_t_user_role')
      .delete()
      .eq('user_id', id);

    if (roleDeleteError) throw roleDeleteError;

    if (roles.length > 0) {
      const { error: roleInsertError } = await supabase
        .from('com_t_user_role')
        .insert(roles.map(roleId => ({ user_id: id, role_id: roleId })));
      
      if (roleInsertError) throw roleInsertError;
    }

    // 2. Auth情報の更新 (Metadataにrolesを含める)
    const { error: authError } = await supabase.auth.admin.updateUserById(id, {
      email: email,
      user_metadata: {
        user_name,
        user_type,
        client_id,
        roles // ここでProxyが参照する配列を更新
      }
    });

    if (authError) {
      return { success: false, errorType: 'update_error', message: `Auth更新失敗: ${authError.message}` };
    }

    // 3. ユーザマスタ (public.com_m_user) の更新
    const { error: dbError } = await supabase
      .from('com_m_user')
      .update({
        user_name,
        user_type,
        client_id,
        update_date: new Date().toISOString()
      })
      .eq('id', id);

    if (dbError) {
      console.error("DB Update Error:", dbError);
      return { success: false, errorType: 'update_error', message: `マスタ更新に失敗しました: ${dbError.message}` };
    }

    revalidatePath('/users');
    return { success: true };

  } catch (err) {
    console.error("Unexpected Update Error:", err);
    return { success: false, errorType: 'unexpected_error', message: "通信エラーが発生しました。" };
  }
}

/**
 * ユーザー一括登録アクション
 * 複数のユーザーを順番に招待し、各レコードの結果を返します。
 */
export async function bulkCreateUsers(users: BulkUser[]): Promise<BulkImportResponse> {
  const results: BulkImportResultDetail[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      const result = await createUser({
        email: user.email,
        user_name: user.user_name,
        client_id: user.client_id,
        user_type: user.user_type
      });

      if (result.success && result.user_id) {
        successCount++;
        results.push({ 
          id: result.user_id, 
          email: user.email, 
          status: 'success' 
        });
      } else {
        errorCount++;
        results.push({ 
          email: user.email, 
          status: 'error', 
          message: result.message || "登録に失敗しました" 
        });
      }
    } catch (err) {
      errorCount++;
      results.push({ 
        email: user.email, 
        status: 'error', 
        message: "予期せぬエラーが発生しました"
      });
    }
  }

  // ループ終了後に確実に最新の状態にする
  revalidatePath('/users');
  return { success: true, total: users.length, successCount, errorCount, details: results };
}

/**
 * ロールマスタの一覧取得
 * ユーザー編集・登録時のチェックボックス選択肢として利用
 */
export async function getRoles(): Promise<RoleDefinition[]> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('com_m_role')
    .select('role_id, role_name, target_user_type, seq_no') // target_user_type を追加
    .eq('delete_flg', '0')
    .order('seq_no', { ascending: true });

  if (error) {
    console.error("Fetch Roles Error:", error.message);
    return [];
  }

  // 型安全のためにキャスト
  return data as RoleDefinition[];
}