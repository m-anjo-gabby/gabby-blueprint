/**
 * license-management-overhaul-seed.ts で投入したデータに対し、com_t_user_license の
 * 排他制約(excl_user_license_active_overlap)の振る舞いを、service_roleでの直接
 * INSERT/UPDATEで検証する。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260918-dev/license-management-overhaul-verify.ts --env=dev --tag=licenseoverhaul01
 *
 * 事前にlicense-management-overhaul-seed.tsを同じ--tagで実行しておくこと。
 * 排他制約はauth.uid()に依存しないテーブル制約のため、service_role直接操作で
 * dev/staging適用後の実際のDB挙動をそのまま再現できる（実サインインJWTは不要）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";
import { writeResultLog, type CheckResult } from "../../../helpers/results.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";

const admin = await createAdminClient();
const checks: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` — ${detail}` : ""}`);
}

const EXCLUSION_VIOLATION = "23P01";

console.log(`\n=== ライセンス管理見直し②シナリオ検証: env=${env} tag=${TAG} ===`);

async function findAuthUserByEmail(email: string): Promise<string | undefined> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return undefined;
}

async function getContractIdByNote(note: string): Promise<string> {
  const { data, error } = await admin.from("com_m_contract").select("contract_id").eq("note", note).single();
  if (error) throw new Error(`契約が見つかりません(note=${note}): ${error.message}`);
  return data.contract_id as string;
}

async function getLicense(contractId: string, userId: string): Promise<{ license_id: string; status: number; start_date: string; end_date: string }> {
  const { data, error } = await admin
    .from("com_t_user_license")
    .select("license_id, status, start_date, end_date")
    .eq("contract_id", contractId)
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`ライセンスが見つかりません(contractId=${contractId}, userId=${userId}): ${error.message}`);
  return data as { license_id: string; status: number; start_date: string; end_date: string };
}

const studentAId = await findAuthUserByEmail(`${TAG}-license-student-a@gabby-qa-test.example`);
const studentBId = await findAuthUserByEmail(`${TAG}-license-student-b@gabby-qa-test.example`);
if (!studentAId || !studentBId) {
  throw new Error("必要なQAユーザーが見つかりません。先にlicense-management-overhaul-seed.tsを実行してください。");
}

const contractACurrentId = await getContractIdByNote(`${TAG} 生徒A 現行ターム`);
const contractANextId = await getContractIdByNote(`${TAG} 生徒A 次ターム`);
// 生徒Aが未保有のcontract_id。UNIQUE(user_id, contract_id)との混同を避け、排他制約(EXCLUDE)
// 単体の挙動を切り分けるための「予備枠」として使う（生徒Bの契約だが、com_t_user_licenseは
// contract_idの所有者を検証しないため、生徒Aへの一時的な割当先としてFK上問題なく使える）
const spareContractForStudentAId = await getContractIdByNote(`${TAG} 生徒B`);

const licenseA1 = await getLicense(contractACurrentId, studentAId);

// ---------------------------------------------------------------------------
// シナリオ1: 期間が重ならない次タームライセンスの前倒し登録は成功する（既存運用の維持確認）
// ---------------------------------------------------------------------------
{
  const { data: contractANext, error: contractError } = await admin
    .from("com_m_contract")
    .select("start_date, end_date")
    .eq("contract_id", contractANextId)
    .single();
  if (contractError || !contractANext) throw new Error(`次ターム契約の取得に失敗: ${contractError?.message}`);

  const { data: nextLicense, error } = await admin
    .from("com_t_user_license")
    .insert({
      contract_id: contractANextId,
      user_id: studentAId,
      status: 1,
      start_date: contractANext.start_date,
      end_date: contractANext.end_date,
    })
    .select("license_id")
    .single();

  record(
    "シナリオ1: 次タームライセンス(期間重複なし)のINSERTが成功する",
    !error && !!nextLicense,
    error ? `${error.code} ${error.message}` : undefined
  );
}

// ---------------------------------------------------------------------------
// シナリオ2: 既存の有効ライセンス(A1)と期間が重なる新規の有効ライセンスはINSERTできない
// ---------------------------------------------------------------------------
{
  // 同一contract_id(contractACurrentId)だとUNIQUE(user_id, contract_id)にも触れて排他制約単体の
  // 挙動を切り分けられないため、生徒Aが未保有のspareContractForStudentAIdへ挿入を試みる
  const { error } = await admin.from("com_t_user_license").insert({
    contract_id: spareContractForStudentAId,
    user_id: studentAId,
    status: 1,
    start_date: licenseA1.start_date,
    end_date: licenseA1.end_date,
  });

  record(
    "シナリオ2: 重複期間の有効ライセンスのINSERTが排他制約(23P01)で拒否される",
    error?.code === EXCLUSION_VIOLATION,
    error ? `${error.code} ${error.message}` : "エラーなしでINSERTが成功してしまった"
  );
}

// ---------------------------------------------------------------------------
// シナリオ3: 既存ライセンス(次ターム)のUPDATEで、A1と重なる期間へ変更できない
// ---------------------------------------------------------------------------
{
  const licenseA2 = await getLicense(contractANextId, studentAId);
  const { error } = await admin
    .from("com_t_user_license")
    .update({ start_date: licenseA1.start_date, end_date: licenseA1.end_date })
    .eq("license_id", licenseA2.license_id);

  record(
    "シナリオ3: UPDATEでA1と重なる期間への変更が排他制約(23P01)で拒否される",
    error?.code === EXCLUSION_VIOLATION,
    error ? `${error.code} ${error.message}` : "エラーなしでUPDATEが成功してしまった"
  );

  // 後続シナリオへの影響を避けるため、失敗しているはずのUPDATEが実際に反映されていないことも確認する
  const licenseA2After = await getLicense(contractANextId, studentAId);
  record(
    "シナリオ3補足: 拒否されたUPDATEは実際にロールバックされ、A2の期間は変更されていない",
    licenseA2After.start_date === licenseA2.start_date && licenseA2After.end_date === licenseA2.end_date
  );
}

// ---------------------------------------------------------------------------
// シナリオ4: A1を無効化(status=0)すると、同じ期間で新規の有効ライセンスをINSERTできる
// ---------------------------------------------------------------------------
{
  const { error: invalidateError } = await admin.from("com_t_user_license").update({ status: 0 }).eq("license_id", licenseA1.license_id);
  record("シナリオ4-前提: A1をstatus=0に無効化できる", !invalidateError, invalidateError?.message);

  const { data: reissued, error } = await admin
    .from("com_t_user_license")
    .insert({
      contract_id: spareContractForStudentAId, // シナリオ2と同じ理由でcontractACurrentIdは使わない
      user_id: studentAId,
      status: 1,
      start_date: licenseA1.start_date,
      end_date: licenseA1.end_date,
    })
    .select("license_id")
    .single();

  record(
    "シナリオ4: 無効化済みライセンスと同じ期間でも新規の有効ライセンスをINSERTできる(status=1のみが排他対象)",
    !error && !!reissued,
    error ? `${error.code} ${error.message}` : undefined
  );

  // シナリオ2と同じ状況を作ってしまうため、後続に影響しないようこのINSERT分は元に戻しておく
  if (reissued) {
    await admin.from("com_t_user_license").delete().eq("license_id", reissued.license_id);
  }
  // A1のstatusも元(1)に戻しておく(冪等な再実行のため)
  await admin.from("com_t_user_license").update({ status: 1 }).eq("license_id", licenseA1.license_id);
}

// ---------------------------------------------------------------------------
// シナリオ5: 排他制約はuser_id単位。生徒Aの現行タームと完全に同じ期間でも、
// (生徒Bがまだ保有していない)contractACurrentId経由で生徒BへのINSERTは成功する
// （UNIQUE(user_id, contract_id)との混同を避けるため、生徒B自身のcontractBIdは使わない）
// ---------------------------------------------------------------------------
{
  const { data: crossUserLicense, error } = await admin
    .from("com_t_user_license")
    .insert({
      contract_id: contractACurrentId,
      user_id: studentBId,
      status: 1,
      start_date: licenseA1.start_date, // 生徒Aの現行タームと完全同一期間
      end_date: licenseA1.end_date,
    })
    .select("license_id")
    .single();

  record(
    "シナリオ5: 生徒Aと完全同一期間でも、排他制約(EXCLUDE)はuser_id違いの生徒BのINSERTを妨げない",
    !error && !!crossUserLicense,
    error ? `${error.code} ${error.message}` : undefined
  );

  if (crossUserLicense) {
    await admin.from("com_t_user_license").delete().eq("license_id", crossUserLicense.license_id);
  }
}

const log = writeResultLog({ scenario: "license-management-overhaul.feature", env, tag: TAG, checks });
process.exit(log.ok ? 0 : 1);
