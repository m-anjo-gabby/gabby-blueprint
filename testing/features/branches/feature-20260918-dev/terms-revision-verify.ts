/**
 * 規約本文のDB管理化・リビジョン管理（サイレント更新）の検証。
 * RPC(create_term / add_term_revision)・RLS・不変性トリガー・同意時のrevision_id記録を、
 * 固定アカウント（qa-admin / qa-student-01）の実サインインJWT経由で確認する。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260918-dev/terms-revision-verify.ts --env=dev --tag=termsrev01
 *
 * 【他ユーザーへの影響を避ける設計】
 *   検証用バージョンは is_required=false で作成する。生徒の未同意判定は is_required=true の
 *   規約のみが対象のため、公開済み（過去日）で作成しても実ユーザーに同意モーダルは出ない。
 *   ただしアドミン一覧の「公開中」表示は一時的に検証用バージョンになるため、実行後は
 *   必ず後始末まで完了させること（本スクリプトは finally で自動削除する）。
 *   --keep を付けた場合のみ後始末を行わない（ブラウザでの手動確認用）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { writeResultLog, type CheckResult } from "../../../helpers/results.ts";
import { createClient } from "@supabase/supabase-js";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "termsrev01";
const KEEP = process.argv.includes("--keep");
const PASSWORD = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}

const ADMIN_EMAIL = "qa-admin@gabby-qa-test.example";
const STUDENT_EMAIL = "qa-student-01@gabby-qa-test.example";
const PUBLISHED_VERSION = `${TAG}-published`;
const UPCOMING_VERSION = `${TAG}-upcoming`;

const service = await createAdminClient(); // 後始末・トリガー検証専用（RPCの実行には使わない）
const checks: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function cleanup() {
  const { data: terms } = await service
    .from("com_m_terms")
    .select("term_id")
    .in("version_name", [PUBLISHED_VERSION, UPCOMING_VERSION]);
  const termIds = (terms ?? []).map((t) => t.term_id);
  if (termIds.length === 0) return;
  await service.from("com_t_user_terms_agreement").delete().in("term_id", termIds);
  await service.from("com_m_terms").delete().in("term_id", termIds); // リビジョンはCASCADE
  console.log(`後始末: 検証用バージョン ${termIds.length}件と関連データを削除しました`);
}

console.log(`\n=== 規約リビジョン管理 検証: env=${env} tag=${TAG} ===`);

await cleanup(); // 前回の中断分を除去（resumable）

const adminClient = await signInAsRole(ADMIN_EMAIL, PASSWORD);
const studentClient = await signInAsRole(STUDENT_EMAIL, PASSWORD);
const { data: adminUser } = await adminClient.auth.getUser();
const { data: studentUser } = await studentClient.auth.getUser();

try {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  // 1. アドミン: 公開済みバージョンの作成（バージョン＋リビジョン1）
  const { data: publishedTermId, error: createErr } = await adminClient.rpc("create_term", {
    p_term_type: "TERMS",
    p_version_name: PUBLISHED_VERSION,
    p_published_date: yesterday,
    p_is_required: false,
    p_content: "# 検証用規約\n\n初版本文",
  });
  record("admin: create_term で作成できる", !createErr && typeof publishedTermId === "string", createErr?.message);

  const { data: rev1 } = await service
    .from("com_m_terms_revision")
    .select("revision_id, revision_no, insert_user")
    .eq("term_id", publishedTermId)
    .order("revision_no");
  record(
    "create_term: リビジョン1が作成者付きで登録される",
    rev1?.length === 1 && rev1[0].revision_no === 1 && rev1[0].insert_user === adminUser.user?.id,
    JSON.stringify(rev1)
  );

  // 2. 重複バージョン名は 23505
  const { error: dupErr } = await adminClient.rpc("create_term", {
    p_term_type: "TERMS",
    p_version_name: PUBLISHED_VERSION,
    p_published_date: yesterday,
    p_is_required: false,
    p_content: "dup",
  });
  record("create_term: 同一種別・バージョン名は23505で拒否", dupErr?.code === "23505", dupErr?.code);

  // 3. 公開済みへの修正は修正理由が必須
  const { error: noNoteErr } = await adminClient.rpc("add_term_revision", {
    p_term_id: publishedTermId,
    p_content: "# 検証用規約\n\n誤字修正版",
    p_change_note: "",
  });
  record("add_term_revision: 公開済みで修正理由なしは拒否", !!noNoteErr?.message.includes("change_note is required"), noNoteErr?.message);

  // 4. 本文が変わっていない場合は拒否
  const { error: sameErr } = await adminClient.rpc("add_term_revision", {
    p_term_id: publishedTermId,
    p_content: "# 検証用規約\n\n初版本文",
    p_change_note: "変更なし",
  });
  record("add_term_revision: 本文未変更は拒否", !!sameErr?.message.includes("content is unchanged"), sameErr?.message);

  // 5. 修正理由ありでリビジョン2が追加される（サイレント更新）
  const { data: revNo, error: addErr } = await adminClient.rpc("add_term_revision", {
    p_term_id: publishedTermId,
    p_content: "# 検証用規約\n\n誤字修正版",
    p_change_note: "誤字修正",
  });
  record("add_term_revision: 修正理由ありでリビジョン2が追加される", !addErr && revNo === 2, addErr?.message ?? `revNo=${revNo}`);

  // 6. 公開前バージョンは修正理由なしでも修正できる
  const { data: upcomingTermId } = await adminClient.rpc("create_term", {
    p_term_type: "PRIVACY",
    p_version_name: UPCOMING_VERSION,
    p_published_date: nextYear,
    p_is_required: false,
    p_content: "公開前 初版",
  });
  const { data: upRevNo, error: upErr } = await adminClient.rpc("add_term_revision", {
    p_term_id: upcomingTermId,
    p_content: "公開前 修正版",
    p_change_note: null,
  });
  record("add_term_revision: 公開前は修正理由なしで追加できる", !upErr && upRevNo === 2, upErr?.message);

  // 7. 生徒はRPCを実行できない
  const { error: stCreateErr } = await studentClient.rpc("create_term", {
    p_term_type: "TERMS",
    p_version_name: `${TAG}-student`,
    p_published_date: nextYear,
    p_is_required: false,
    p_content: "x",
  });
  record("student: create_term は拒否", !!stCreateErr?.message.includes("not authorized"), stCreateErr?.message);
  const { error: stAddErr } = await studentClient.rpc("add_term_revision", {
    p_term_id: publishedTermId,
    p_content: "改ざん",
    p_change_note: "x",
  });
  record("student: add_term_revision は拒否", !!stAddErr?.message.includes("not authorized"), stAddErr?.message);

  // 8. リビジョンは追記専用（UPDATEはトリガーで拒否。RLSを越えるservice_roleでも不可）
  const { error: updErr } = await service
    .from("com_m_terms_revision")
    .update({ content: "改ざん" })
    .eq("term_id", publishedTermId);
  record("trigger: リビジョンのUPDATEは拒否される", !!updErr?.message.includes("append-only"), updErr?.message);

  // 9. 生徒・匿名はリビジョン（公開情報）を参照できる
  const { data: stRevs } = await studentClient
    .from("com_m_terms_revision")
    .select("revision_id, revision_no")
    .eq("term_id", publishedTermId)
    .order("revision_no", { ascending: false });
  record("student: 最新リビジョン(2)を参照できる", stRevs?.[0]?.revision_no === 2, JSON.stringify(stRevs));

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: anonRevs } = await anon.from("com_m_terms_revision").select("revision_id").eq("term_id", publishedTermId);
  record("anon: リビジョンを参照できる", (anonRevs?.length ?? 0) === 2);

  // 10. 生徒はリビジョンを直接INSERTできない
  const { error: stInsErr } = await studentClient.from("com_m_terms_revision").insert({
    term_id: publishedTermId,
    revision_no: 99,
    content: "不正",
  });
  record("student: リビジョンの直接INSERTは拒否", !!stInsErr, stInsErr?.message);

  // 11. 同意時に表示したリビジョンを記録できる
  const latestRevisionId = stRevs?.[0]?.revision_id;
  const { error: agreeErr } = await studentClient.from("com_t_user_terms_agreement").insert({
    user_id: studentUser.user?.id,
    term_id: publishedTermId,
    revision_id: latestRevisionId,
    ip_address: "127.0.0.1",
    user_agent: `terms-revision-verify/${TAG}`,
  });
  const { data: agreement } = await service
    .from("com_t_user_terms_agreement")
    .select("revision_id")
    .eq("term_id", publishedTermId)
    .eq("user_id", studentUser.user?.id)
    .maybeSingle();
  record("student: 同意時の revision_id が記録される", !agreeErr && agreement?.revision_id === latestRevisionId, agreeErr?.message);

  // 12. 同意済みリビジョンはFKにより削除不可（証跡の保護）
  const { error: delRevErr } = await service.from("com_m_terms_revision").delete().eq("revision_id", latestRevisionId);
  record("FK: 同意済みリビジョンは削除できない", !!delRevErr, delRevErr?.message);
} finally {
  await signOutRole(adminClient);
  await signOutRole(studentClient);
  if (KEEP) {
    console.log("--keep 指定のため後始末を行いません。確認後に --keep なしで再実行すると削除されます。");
  } else {
    await cleanup();
  }
}

const log = writeResultLog({ scenario: "terms-revision", env, tag: TAG, checks });
console.log(`\n結果: ${log.passed}/${log.totalChecks} OK`);
if (!log.ok) process.exit(1);
