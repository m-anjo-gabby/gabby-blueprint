/**
 * コーチ向け請求書/支払通知書PDFに使う会社情報（com_m_company_profile、リリースのセクション1）の検証。
 * 名義がバンクーバー法人に是正され、税務登録番号列が追加されていること、運用上1行のみであることを
 * 確認する（読み取りのみ。PDFのレイアウト自体はアプリ側の変更のためブラウザでの確認対象）。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260918-dev/company-profile-verify.ts --env=staging --tag=stg0924
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";
import { writeResultLog, type CheckResult } from "../../../helpers/results.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const service = await createAdminClient(); // 管理者のみが参照するマスタの読み取り専用
const checks: CheckResult[] = [];
function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` … ${detail}` : ""}`);
}

console.log(`\n=== 会社情報(請求書PDF)の検証: env=${env} tag=${TAG} ===`);

const { data, error } = await service.from("com_m_company_profile").select("company_profile_id, company_name, address, logo_path, tax_registration_number");
record("tax_registration_number 列を含めて参照できる（列追加の反映）", !error, error?.message);

const rows = data ?? [];
record("会社情報は1行のみ（シングルトン運用）", rows.length === 1, `${rows.length}行`);
const row = rows[0];
record("名義がバンクーバー法人（Global Vision Technology Vancouver, Inc.）", row?.company_name === "Global Vision Technology Vancouver, Inc.", row?.company_name);
record("住所がバンクーバー（Vancouver, BC）", typeof row?.address === "string" && row.address.includes("Vancouver, BC"), row?.address?.replace(/\n/g, " / "));
record("税務登録番号は未登録（NULL運用）", row?.tax_registration_number === null, String(row?.tax_registration_number));

const log = writeResultLog({ scenario: "company-profile", env, tag: TAG, checks });
console.log(`\n結果: ${log.passed}/${log.totalChecks} OK`);
