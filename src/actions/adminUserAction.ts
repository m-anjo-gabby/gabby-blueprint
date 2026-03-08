// src/actions/adminUserAction.ts
'use server';

import { createAdminClient } from "@/lib/admin";
import { BulkUser, UserRecord } from "@/types/user";

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
 * ユーザー登録アクション
 * ユーザーを作成し、パスワード設定用の招待メールを送信します。
 * パスワードはユーザー自身が設定するため、サーバー側での固定値管理は不要です。
 */
export async function createUser(
  email: string,
  user_name: string,
  client_id: string,
  user_type: string
) {
  try {
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

    if (error) {
      // Supabase固有のエラーコードに応じたメッセージ切り分け
      if (error.status === 422 && error.code === 'email_exists') {
        return { success: false, errorType: 'email_exists', message: "このメールアドレスは既に登録されています。" };
      }
      // その他認証エラー
      return { success: false, errorType: 'unexpected_error', message: `登録に失敗しました: ${error.message}` };
    }

    return { success: true, userId: data.user.id };

  } catch (err) {
    // 予期せぬネットワークエラーなど
    console.error("Unexpected Error:", err);
    return { success: false, errorType: 'unexpected_error', message: "通信エラーが発生しました。時間を置いて再度お試しください。" };
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
  return { success: true };
}

/**
 * ユーザー更新アクション
 */
export async function updateUser(
  id: string, // auth.users.id (UUID)
  email: string,
  user_name: string,
  client_id: string,
  user_type: string
) {
  try {
    const supabase = await createAdminClient();

    // 1. Auth情報の更新 (Metadataを更新)
    const { error: authError } = await supabase.auth.admin.updateUserById(id, {
      email: email,
      user_metadata: {
        user_name,
        user_type,
        client_id
      }
    });

    if (authError) {
      return { success: false, errorType: 'update_error', message: `Auth更新失敗: ${authError.message}` };
    }

    // 2. ユーザマスタ (public.com_m_user) の更新
    const { error: dbError } = await supabase
      .from('com_m_user')
      .update({
        user_name: user_name,
        user_type: user_type,
        client_id: client_id,
        update_date: new Date().toISOString() // 明示的に更新日時をセット
      })
      .eq('id', id); // auth.users.id と一致するレコードを指定

    if (dbError) {
      console.error("DB Update Error:", dbError);
      return { success: false, errorType: 'update_error', message: `マスタ更新に失敗しました: ${dbError.message}` };
    }

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
export async function bulkCreateUsers(users: BulkUser[]) {
  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      // 既存の createUser ロジックを再利用
      const result = await createUser(
        user.email,
        user.user_name,
        user.client_id,
        user.user_type
      );

      if (result.success) {
        successCount++;
        results.push({ email: user.email, status: 'success' });
      } else {
        errorCount++;
        results.push({ 
          email: user.email, 
          status: 'error', 
          message: result.message 
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

  return {
    success: true,
    total: users.length,
    successCount,
    errorCount,
    details: results
  };
}