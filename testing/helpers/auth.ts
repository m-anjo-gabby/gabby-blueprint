import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@gabby/lib/supabase/admin";

/**
 * service_role権限のクライアント。
 * テストデータの初期セットアップ／後始末専用に使うこと。
 * SECURITY DEFINER関数（本人 or admin 認可判定を含むRPC）の実行には
 * 絶対に使わない（auth.uid()がNULLになり認可分岐を誤って通過するため。CLAUDE.md 6章参照）。
 */
export { createAdminClient };

/**
 * 実際にメール/パスワードでサインインし、そのロールの実JWTを持つ
 * Supabaseクライアントを返す。業務ロジックRPC・RLS配下のテーブル操作は
 * 必ずこの関数で取得したクライアントを使用する。
 */
export async function signInAsRole(email: string, password: string): Promise<SupabaseClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY が未ロードです。先に loadTestEnv() を呼んでください。");
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`サインインに失敗しました (${email}): ${error?.message ?? "unknown error"}`);
  }

  return client;
}

/** signInAsRole で取得したクライアントをサインアウトする（後始末用）。 */
export async function signOutRole(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}
