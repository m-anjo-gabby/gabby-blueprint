import type { SupabaseClient } from "@supabase/supabase-js";

export interface RpcCheck {
  /** 確認対象のRPC(SECURITY DEFINER関数)名 */
  name: string;
  /** 存在確認用のダミー引数。型さえ合えば実際の値は何でもよい。 */
  dummyArgs: Record<string, unknown>;
}

const UNDEFINED_FUNCTION = "42883"; // Postgres: undefined_function

/**
 * supabase/release/ 配下のリリーススクリプトが対象環境に適用済みかを、
 * RPCの存在有無で確認する（CLAUDE.md 6章: 未反映stepの手戻り防止）。
 * ダミー引数での呼び出し自体が業務エラーになるのは「存在する」証拠として扱い、
 * 42883(undefined_function)のみを「未反映」と判定する。
 */
export async function assertReleaseApplied(adminClient: SupabaseClient, checks: RpcCheck[]): Promise<void> {
  const missing: string[] = [];

  for (const check of checks) {
    const { error } = await adminClient.rpc(check.name, check.dummyArgs);
    if (error?.code === UNDEFINED_FUNCTION) {
      missing.push(check.name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `以下のRPCが対象環境に未反映です。supabase/release/ 配下の最新リリーススクリプトの適用状況を確認してください:\n` +
        missing.map((name) => `  - ${name}`).join("\n")
    );
  }
}
