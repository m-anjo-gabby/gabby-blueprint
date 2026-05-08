// apps/student/actions/termAction.ts
"use server";
import { createServerClient } from "@gabby/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export async function checkPendingAgreements(userId: string) {
  const supabase = await createServerClient();

  // 1. まず「最新の必須規約」のリストを特定する
  // ※ ここで DISTINCT ON が使えれば理想ですが、SDKの制約上、全件取得してメモリで絞るか、
  //    シンプルに2クエリに分けるのがクリーンです。
  //    今回は「1リクエスト」にこだわり、JOINを使って判定します。

  const { data: terms, error } = await supabase
    .from("com_m_terms")
    .select(`
      term_id,
      term_type,
      version_name,
      storage_path,
      published_date,
      com_t_user_terms_agreement!left (
        agreement_id
      )
    `)
    .eq("is_required", true)
    .eq("com_t_user_terms_agreement.user_id", userId)
    .order("published_date", { ascending: false });

  if (error || !terms) return [];

  // 2. メモリ上で「タイプごとの最新」だけをまず抽出する
  const latestMap = new Map<string, typeof terms[0]>();
  for (const term of terms) {
    if (!latestMap.has(term.term_type)) {
      latestMap.set(term.term_type, term);
    }
  }

  // 3. 抽出された「最新」の中で、同意履歴がないものだけを「未同意」として返す
  // これにより、過去分が未同意であっても、最新が同意済みならここには含まれません。
  return Array.from(latestMap.values()).filter(
    (term) => term.com_t_user_terms_agreement.length === 0
  );
}

export async function agreeToTerms(userId: string, termIds: string[]) {
  const supabase = await createServerClient();
  const headerList = await headers();

	// 各種メタデータの取得
  const userAgent = headerList.get("user-agent") || "unknown";
  // プロキシ経由のIPを優先的に取得
  const forwarded = headerList.get("x-forwarded-for");
  const ipAddress = forwarded ? forwarded.split(",")[0] : "unknown";

  const inserts = termIds.map((id) => ({
    user_id: userId,
    term_id: id,
		ip_address: ipAddress,
		user_agent: userAgent,
  }));

  const { error } = await supabase
    .from("com_t_user_terms_agreement")
    .insert(inserts);

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout"); // レイアウトを再検証してモーダルを消す
  return { success: true };
}