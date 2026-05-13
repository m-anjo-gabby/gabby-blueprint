"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createLogger, getLogContext } from "@gabby/lib/logger";

const logger = createLogger('student');

/**
 * 未同意の必須規約があるかチェックする
 */
export async function checkPendingAgreements(userId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();

    // 1. まず「最新の必須規約」のリストを特定する
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

    if (error) {
      logger.error('term:check_pending_failed', error.message, { ...ctx, payload: { userId } });
      return [];
    }

    if (!terms) return [];

    // 2. メモリ上で「タイプごとの最新」だけをまず抽出する
    const latestMap = new Map<string, typeof terms[0]>();
    for (const term of terms) {
      if (!latestMap.has(term.term_type)) {
        latestMap.set(term.term_type, term);
      }
    }

    // 3. 抽出された「最新」の中で、同意履歴がないものだけを「未同意」として返す
    const pendingTerms = Array.from(latestMap.values()).filter(
      (term) => term.com_t_user_terms_agreement.length === 0
    );

    if (pendingTerms.length > 0) {
      logger.info('term:pending_terms_found', `User has ${pendingTerms.length} pending terms`, { 
        ...ctx, 
        payload: { userId, termCount: pendingTerms.length } 
      });
    }

    return pendingTerms;
  } catch (err) {
    logger.error('term:check_pending_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { userId } });
    return [];
  }
}

/**
 * 規約への同意を記録する
 */
export async function agreeToTerms(userId: string, termIds: string[]) {
  const ctx = await getLogContext();
  try {
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

    if (error) {
      logger.error('term:agree_failed', error.message, { ...ctx, payload: { userId, termIds } });
      throw new Error(error.message);
    }

    logger.info('term:agree_success', `User agreed to terms: ${termIds.join(', ')}`, {
      ...ctx,
      payload: { 
        userId, 
        termIds,
        ipAddress,
        userAgent 
      }
    });

    revalidatePath("/", "layout"); // レイアウトを再検証してモーダルを消す
    return { success: true };
  } catch (err) {
    logger.error('term:agree_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { userId, termIds } });
    throw err;
  }
}