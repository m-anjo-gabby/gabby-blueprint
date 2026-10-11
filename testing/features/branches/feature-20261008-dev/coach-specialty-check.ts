/**
 * コーチの専門（admin_set_coach_specialties と参照・書き込みの権限）の確認スクリプト。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20261008-dev/coach-specialty-check.ts --env=dev
 *
 * 固定アカウント qa-coach-us-01 の専門を書き換えて確認し、最後に実行前の設定へ戻す（データは残らない）。
 * RPC・テーブルの操作は各ロール（qa-admin / qa-coach-us-01 / qa-student-01）の実JWTで行う。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const PASSWORD = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}

const ADMIN_EMAIL = "qa-admin@gabby-qa-test.example";
const COACH_EMAIL = "qa-coach-us-01@gabby-qa-test.example";
const STUDENT_EMAIL = "qa-student-01@gabby-qa-test.example";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  NG   ${label}`, detail ?? "");
  }
}

async function userId(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("ユーザーを取得できませんでした");
  return data.user.id;
}

async function codesOf(client: SupabaseClient, coachId: string): Promise<string[]> {
  const { data, error } = await client
    .from("com_m_coach_specialty_assignment")
    .select("specialty_code")
    .eq("coach_id", coachId);
  if (error) throw error;
  return (data ?? []).map((r) => r.specialty_code as string).sort();
}

async function main(): Promise<void> {
  const service = await createAdminClient();
  const admin = await signInAsRole(ADMIN_EMAIL, PASSWORD!);
  const coach = await signInAsRole(COACH_EMAIL, PASSWORD!);
  const student = await signInAsRole(STUDENT_EMAIL, PASSWORD!);
  const adminId = await userId(admin);
  const coachId = await userId(coach);

  const original = await codesOf(service, coachId);
  console.log(`[${env}] 対象コーチ ${COACH_EMAIL}（実行前の専門: ${original.join(", ") || "なし"}）`);

  try {
    console.log("アドミンによる設定");
    {
      const { data, error } = await admin.rpc("admin_set_coach_specialties", {
        p_coach_id: coachId,
        p_specialty_codes: ["tech", "business", "finance", "engineering", "pronunciation_pro", "business"],
      });
      check("分野4つ＋発音プロ（重複あり）を設定できる", !error, error);
      check(
        "返り値はマスタの表示順・重複なし",
        JSON.stringify(data) === JSON.stringify(["business", "finance", "tech", "engineering", "pronunciation_pro"]),
        data
      );
    }
    {
      const { error } = await admin.rpc("admin_set_coach_specialties", {
        p_coach_id: coachId,
        p_specialty_codes: ["business", "finance", "tech", "engineering", "media"],
      });
      check("分野5つは TOO_MANY_FIELDS で拒否", !!error?.message.includes("TOO_MANY_FIELDS"), error);
      const after = await codesOf(service, coachId);
      check("拒否された場合は設定が変わらない", after.length === 5 && !after.includes("media"), after);
    }
    {
      const { error } = await admin.rpc("admin_set_coach_specialties", { p_coach_id: coachId, p_specialty_codes: ["unknown"] });
      check("マスタに無いコードは INVALID_SPECIALTY で拒否", !!error?.message.includes("INVALID_SPECIALTY"), error);
    }
    {
      const { error } = await admin.rpc("admin_set_coach_specialties", { p_coach_id: adminId, p_specialty_codes: ["business"] });
      check("コーチ以外は COACH_NOT_FOUND で拒否", !!error?.message.includes("COACH_NOT_FOUND"), error);
    }
    {
      const { data, error } = await admin.rpc("admin_set_coach_specialties", {
        p_coach_id: coachId,
        p_specialty_codes: ["media", "pronunciation_pro"],
      });
      check("置き換え（外したものは削除・足したものは登録）", !error && JSON.stringify(data) === JSON.stringify(["media", "pronunciation_pro"]), error ?? data);
    }

    console.log("コーチ本人は変更できない");
    {
      const { error } = await coach.rpc("admin_set_coach_specialties", { p_coach_id: coachId, p_specialty_codes: ["arts"] });
      check("RPC は NOT_AUTHORIZED で拒否", !!error?.message.includes("NOT_AUTHORIZED"), error);
      const { error: insertError } = await coach
        .from("com_m_coach_specialty_assignment")
        .insert({ coach_id: coachId, specialty_code: "arts" });
      check("テーブルへの直接の登録は拒否", !!insertError, insertError);
      await coach.from("com_m_coach_specialty_assignment").delete().eq("coach_id", coachId);
      const after = await codesOf(service, coachId);
      check("テーブルからの直接の削除は効かない", after.length === 2, after);
      const { data: own, error: ownError } = await coach
        .from("com_m_coach_specialty_assignment")
        .select("specialty_code")
        .eq("coach_id", coachId);
      check("自分の専門は参照できる", !ownError && (own ?? []).length === 2, ownError ?? own);
    }

    console.log("生徒の参照");
    {
      const { data: master, error: masterError } = await student
        .from("com_m_coach_specialty")
        .select("specialty_code, kind")
        .order("sort_no");
      check("専門マスタ9項目を参照できる", !masterError && (master ?? []).length === 9, masterError ?? master);
      check(
        "発音プロだけが kind=skill",
        (master ?? []).filter((m) => m.kind === "skill").map((m) => m.specialty_code).join() === "pronunciation_pro",
        master
      );
      const codes = await codesOf(student, coachId);
      check("コーチの専門を参照できる", codes.join() === "media,pronunciation_pro", codes);
      const { error } = await student.rpc("admin_set_coach_specialties", { p_coach_id: coachId, p_specialty_codes: [] });
      check("RPC は NOT_AUTHORIZED で拒否", !!error?.message.includes("NOT_AUTHORIZED"), error);
    }
  } finally {
    const { error } = await admin.rpc("admin_set_coach_specialties", { p_coach_id: coachId, p_specialty_codes: original });
    const restored = await codesOf(service, coachId);
    check("実行前の設定へ戻す", !error && restored.join() === original.join(), error ?? restored);
    await Promise.all([signOutRole(admin), signOutRole(coach), signOutRole(student)]);
  }

  console.log(failures === 0 ? "すべて成功" : `${failures}件 失敗`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
