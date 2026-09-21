import type { SupabaseClient } from "@supabase/supabase-js";

export interface RpcCheck {
  /** 確認対象のRPC(SECURITY DEFINER関数)名 */
  name: string;
  /** 存在確認用のダミー引数。型さえ合えば実際の値は何でもよい。 */
  dummyArgs: Record<string, unknown>;
}

const UNDEFINED_FUNCTION = "42883"; // Postgres: undefined_function
// PostgRESTがRPCをスキーマキャッシュ上で解決できない場合に返すコード。関数が本当に
// 存在しない場合、PostgRESTはPostgresにクエリを投げる前にこの時点で弾くため、
// 実際には42883よりもこちらが返ってくるケースが多い（KJ-2026-0912-01参照）。
const POSTGREST_FUNCTION_NOT_FOUND = "PGRST202";

function isFunctionNotFoundError(code: string | undefined): boolean {
  return code === UNDEFINED_FUNCTION || code === POSTGREST_FUNCTION_NOT_FOUND;
}

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
    if (isFunctionNotFoundError(error?.code)) {
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

/**
 * 旧シグネチャ・廃止済みRPCが対象環境から本当に削除されているかを確認する
 * （assertReleaseAppliedの逆）。DROP FUNCTIONを伴うリリース（RPCの置き換え・削除）の
 * 適用確認に使う。42883(undefined_function)以外（=まだ存在する）は失敗として扱う。
 */
export async function assertRpcRemoved(adminClient: SupabaseClient, checks: RpcCheck[]): Promise<void> {
  const stillPresent: string[] = [];

  for (const check of checks) {
    const { error } = await adminClient.rpc(check.name, check.dummyArgs);
    if (!isFunctionNotFoundError(error?.code)) {
      stillPresent.push(check.name);
    }
  }

  if (stillPresent.length > 0) {
    throw new Error(
      `以下のRPCが対象環境にまだ残っています。廃止のためのリリーススクリプト(DROP FUNCTION)の適用状況を確認してください:\n` +
        stillPresent.map((name) => `  - ${name}`).join("\n")
    );
  }
}
