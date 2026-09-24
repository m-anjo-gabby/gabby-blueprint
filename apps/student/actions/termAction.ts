"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";
import type { TermAgreementTarget, TermDocument, TermType } from "@gabby/types/term";

const logger = createLogger('student');

type SupabaseServerClient = Awaited<ReturnType<typeof createServerClient>>;

interface TermVersionRow {
  term_id: string;
  term_type: string;
  version_name: string;
  published_date: string;
}

/**
 * published_date降順に並んだ規約から「種別ごとの最新」のみを抽出する
 */
function pickLatestByType<T extends TermVersionRow>(terms: T[]): T[] {
  const latestMap = new Map<string, T>();
  for (const term of terms) {
    if (!latestMap.has(term.term_type)) {
      latestMap.set(term.term_type, term);
    }
  }
  return Array.from(latestMap.values());
}

/**
 * 規約バージョンに最新リビジョンの本文を付与する（サイレント更新された文言が常に表示される）
 */
async function attachLatestRevision(
  supabase: SupabaseServerClient,
  terms: TermVersionRow[]
): Promise<TermDocument[]> {
  if (terms.length === 0) return [];

  const { data: revisions, error } = await supabase
    .from("com_m_terms_revision")
    .select("revision_id, term_id, revision_no, content")
    .in("term_id", terms.map((term) => term.term_id))
    .order("revision_no", { ascending: false });

  if (error) throw error;

  const latestRevision = new Map<string, { revision_id: string; content: string }>();
  for (const rev of revisions ?? []) {
    if (!latestRevision.has(rev.term_id)) {
      latestRevision.set(rev.term_id, { revision_id: rev.revision_id, content: rev.content });
    }
  }

  return terms.map((term) => {
    const rev = latestRevision.get(term.term_id);
    return {
      term_id: term.term_id,
      term_type: term.term_type as TermType,
      version_name: term.version_name,
      published_date: term.published_date,
      revision_id: rev?.revision_id ?? null,
      content: rev?.content ?? "",
    };
  });
}

/**
 * 最新の必須規約リストを本文付きで取得する（参照用）
 */
export async function getLatestTerms(): Promise<TermDocument[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();

    const { data: terms, error } = await supabase
      .from("com_m_terms")
      .select("term_id, term_type, version_name, published_date")
      .eq("is_required", true)
      .lte("published_date", new Date().toISOString())
      .order("published_date", { ascending: false });

    if (error) {
      logger.error('term:get_latest_failed', error.message, ctx);
      return [];
    }

    return await attachLatestRevision(supabase, pickLatestByType(terms ?? []));
  } catch (err) {
    logger.error('term:get_latest_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return [];
  }
}

/**
 * 未同意の必須規約を本文付きで返す
 */
export async function checkPendingAgreements(userId: string): Promise<TermDocument[]> {
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
        published_date,
        com_t_user_terms_agreement!left (
          agreement_id
        )
      `)
      .eq("is_required", true)
      .lte("published_date", new Date().toISOString())
      .eq("com_t_user_terms_agreement.user_id", userId)
      .order("published_date", { ascending: false });

    if (error) {
      logger.error('term:check_pending_failed', error.message, { ...ctx, payload: { userId } });
      return [];
    }

    // 2. 「タイプごとの最新」の中で、同意履歴がないものだけを「未同意」とする
    //    （同意の単位はバージョン。同一バージョン内のリビジョン追加では再同意を求めない）
    const pendingTerms = pickLatestByType(terms ?? []).filter(
      (term) => term.com_t_user_terms_agreement.length === 0
    );

    if (pendingTerms.length > 0) {
      logger.info('term:pending_terms_found', `User has ${pendingTerms.length} pending terms`, {
        ...ctx,
        payload: { userId, termCount: pendingTerms.length }
      });
    }

    return await attachLatestRevision(supabase, pendingTerms);
  } catch (err) {
    logger.error('term:check_pending_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { userId } });
    return [];
  }
}

/**
 * 規約への同意を記録する（同意時点で表示していたリビジョンも併せて記録する）
 */
export async function agreeToTerms(userId: string, targets: TermAgreementTarget[]) {
  const ctx = await getLogContext();
  const termIds = targets.map((target) => target.term_id);
  try {
    const supabase = await createServerClient();
    const headerList = await headers();

    // 各種メタデータの取得
    const userAgent = headerList.get("user-agent") || "unknown";
    // プロキシ経由のIPを優先的に取得
    const forwarded = headerList.get("x-forwarded-for");
    const ipAddress = forwarded ? forwarded.split(",")[0] : "unknown";

    // クライアントから渡されたリビジョンが該当バージョンのものか検証する（証跡の改ざん防止）
    const revisionIds = targets.flatMap((target) => (target.revision_id ? [target.revision_id] : []));
    if (revisionIds.length > 0) {
      const { data: revisions, error: revError } = await supabase
        .from("com_m_terms_revision")
        .select("revision_id, term_id")
        .in("revision_id", revisionIds);

      if (revError) throw revError;

      const revisionTermMap = new Map((revisions ?? []).map((rev) => [rev.revision_id, rev.term_id]));
      const mismatched = targets.some(
        (target) => target.revision_id && revisionTermMap.get(target.revision_id) !== target.term_id
      );
      if (mismatched) {
        throw new Error("Invalid revision for the term");
      }
    }

    const inserts = targets.map((target) => ({
      user_id: userId,
      term_id: target.term_id,
      revision_id: target.revision_id,
      ip_address: ipAddress,
      user_agent: userAgent,
    }));

    const { error } = await supabase
      .from("com_t_user_terms_agreement")
      .insert(inserts);

    if (error) {
      logger.error('term:agree_failed', error.message, { ...ctx, payload: { userId, targets } });
      throw new Error(error.message);
    }

    logger.info('term:agree_success', `User agreed to terms: ${termIds.join(', ')}`, {
      ...ctx,
      payload: {
        userId,
        targets,
        ipAddress,
        userAgent
      }
    });

    revalidatePath("/", "layout"); // レイアウトを再検証してモーダルを消す
    return { success: true };
  } catch (err) {
    logger.error('term:agree_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { userId, targets } });
    throw err;
  }
}
