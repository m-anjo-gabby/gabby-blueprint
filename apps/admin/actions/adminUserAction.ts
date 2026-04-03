'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { 
  UserRecord, 
  CreateUserPayload, 
  CreateUserResponse, 
  BulkUser, 
  BulkImportResponse, 
  BulkImportResultDetail 
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
  const supabase = await createAdminClient();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
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
export async function createUser(payload: CreateUserPayload): Promise<CreateUserResponse> {
  const { email, user_name, client_id, user_type } = payload;
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
        return { success: false, user_id: null, errorType: 'email_exists', message: "このメールアドレスは既に登録されています。" };
      }
      // その他認証エラー
      return { success: false, user_id: null, errorType: 'unexpected_error', message: `登録に失敗しました: ${error.message}` };
    }

    // 登録成功時にキャッシュを無効化
    revalidatePath('/users');
    return { success: true, user_id: data.user.id, errorType: null, message: null };

  } catch (err) {
    // 予期せぬネットワークエラーなど
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
 */
export async function updateUser(
  id: string, // auth.users.id (UUID)
  payload: CreateUserPayload
) {
  const { email, user_name, client_id, user_type } = payload;
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

    // 更新完了時にキャッシュを無効化
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