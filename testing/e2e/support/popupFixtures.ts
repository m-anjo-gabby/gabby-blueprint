import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../helpers/auth.ts";

/**
 * ポップアップ検証用ペルソナ（qa-student-07、専用テナント）の状態を作り直すヘルパー。
 * service_role はテストデータの準備・後始末にのみ使う（testing/CONVENTIONS.md 3章）。
 * お知らせは専用テナント限定（target_type='CLIENT'）で配信するため、他の利用者には表示されない。
 */

const POPUP_CLIENT_NAME = "【QA固定】ポップアップ検証";
const NOTICE_TITLE_PREFIX = "【QA固定】ポップアップ検証";

export interface PopupFixture {
  admin: SupabaseClient;
  clientId: string;
  userId: string;
}

export async function loadPopupFixture(): Promise<PopupFixture> {
  const admin = await createAdminClient();
  const { data: client, error: clientErr } = await admin
    .from("com_m_client")
    .select("client_id")
    .eq("client_name", POPUP_CLIENT_NAME)
    .single();
  if (clientErr || !client) {
    throw new Error(`${POPUP_CLIENT_NAME} が見つかりません。testing/features/fixtures/seed-fixed-accounts.ts を実行してください。`);
  }
  const { data: user, error: userErr } = await admin
    .from("com_m_user")
    .select("id")
    .eq("client_id", client.client_id)
    .eq("user_type", "1")
    .single();
  if (userErr || !user) throw new Error(`${POPUP_CLIENT_NAME} の生徒が見つかりません: ${userErr?.message}`);
  return { admin, clientId: client.client_id as string, userId: user.id as string };
}

/** 規約の同意履歴を削除し、「最新規約に未同意」の状態にする（テスト内で画面から同意し直す） */
export async function resetTermsAgreement({ admin, userId }: PopupFixture): Promise<void> {
  const { error } = await admin.from("com_t_user_terms_agreement").delete().eq("user_id", userId);
  if (error) throw new Error(`規約同意履歴の削除に失敗: ${error.message}`);
}

/** 専用テナント宛てのお知らせをすべて削除する（既読行は ON DELETE CASCADE で消える） */
export async function clearPopupNotices({ admin, clientId }: PopupFixture): Promise<void> {
  const { error } = await admin.from("com_m_notice").delete().eq("client_id", clientId);
  if (error) throw new Error(`お知らせの削除に失敗: ${error.message}`);
}

/**
 * テスト外のポップアップ対象お知らせ（全体配信など）を既読にし、テストで作成した分だけが表示されるようにする。
 * 変更するのはこのペルソナの既読状態のみ。
 */
export async function markOtherNoticesRead({ admin, clientId, userId }: PopupFixture): Promise<void> {
  const { data, error } = await admin
    .from("com_m_notice")
    .select("notice_id")
    .eq("show_dialog", true)
    .eq("delete_flg", "0")
    .or(`target_type.eq.ALL,and(target_type.eq.CLIENT,client_id.neq.${clientId})`);
  if (error) throw new Error(`お知らせの取得に失敗: ${error.message}`);
  if (!data?.length) return;
  const { error: upsertErr } = await admin
    .from("com_t_notice_read")
    .upsert(data.map((n) => ({ notice_id: n.notice_id, user_id: userId })), { ignoreDuplicates: true });
  if (upsertErr) throw new Error(`既読化に失敗: ${upsertErr.message}`);
}

/** ポップアップ表示指定のお知らせを作成し、タイトルを返す */
export async function createPopupNotices({ admin, clientId }: PopupFixture, count: number): Promise<string[]> {
  const now = Date.now();
  const rows = Array.from({ length: count }, (_, i) => ({
    target_type: "CLIENT",
    client_id: clientId,
    notice_type: "INFO",
    show_dialog: true,
    is_published: true,
    title: `${NOTICE_TITLE_PREFIX} ${i + 1}`,
    content: `E2Eテスト用のお知らせ ${i + 1} です。`,
    // 表示順を安定させるため公開日時をずらす
    published_at: new Date(now - (i + 1) * 60_000).toISOString(),
  }));
  const { error } = await admin.from("com_m_notice").insert(rows);
  if (error) throw new Error(`お知らせの作成に失敗: ${error.message}`);
  return rows.map((r) => r.title);
}

/** 既読になっているお知らせのタイトル一覧 */
export async function readNoticeTitles({ admin, clientId, userId }: PopupFixture): Promise<string[]> {
  const { data, error } = await admin
    .from("com_t_notice_read")
    .select("com_m_notice!inner(title, client_id)")
    .eq("user_id", userId)
    .eq("com_m_notice.client_id", clientId);
  if (error) throw new Error(`既読状態の取得に失敗: ${error.message}`);
  return (data ?? [])
    .flatMap((row) => {
      const notice = row.com_m_notice as { title: string } | { title: string }[];
      return Array.isArray(notice) ? notice.map((n) => n.title) : [notice.title];
    })
    .sort();
}
