import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface TestResultLog {
  scenario: string;
  env: string;
  tag?: string;
  executedAt: string;
  gitCommit: string;
  gitBranch: string;
  totalChecks: number;
  passed: number;
  failed: number;
  ok: boolean;
  checks: CheckResult[];
}

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(THIS_DIR, "../results");

function gitInfo(): { commit: string; branch: string } {
  try {
    const commit = execSync("git rev-parse --short HEAD", { cwd: THIS_DIR }).toString().trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: THIS_DIR }).toString().trim();
    return { commit, branch };
  } catch {
    return { commit: "unknown", branch: "unknown" };
  }
}

/**
 * 検証結果を testing/results/ 配下にJSONとして保存する。
 * ファイル名にシナリオ・env・tag・実行日時を含めるため、
 * 同一シナリオを何度再実行しても過去の結果を上書きしない。
 * git管理下に置くことで、どのコミット時点でどの結果だったかを追跡できるようにする。
 */
export function writeResultLog(params: {
  scenario: string;
  env: string;
  tag?: string;
  checks: CheckResult[];
}): TestResultLog {
  const { commit, branch } = gitInfo();
  const passed = params.checks.filter((c) => c.ok).length;
  const failed = params.checks.length - passed;

  const log: TestResultLog = {
    scenario: params.scenario,
    env: params.env,
    tag: params.tag,
    executedAt: new Date().toISOString(),
    gitCommit: commit,
    gitBranch: branch,
    totalChecks: params.checks.length,
    passed,
    failed,
    ok: failed === 0,
    checks: params.checks,
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  const scenarioSlug = params.scenario.replace(/\.feature$/, "").replace(/[\\/]/g, "__");
  const timestamp = log.executedAt.replace(/[:.]/g, "-");
  const fileName = `${scenarioSlug}__${params.env}${params.tag ? `-${params.tag}` : ""}__${timestamp}.json`;
  const filePath = path.join(RESULTS_DIR, fileName);
  writeFileSync(filePath, JSON.stringify(log, null, 2) + "\n", "utf-8");
  console.log(`\n結果ログを保存しました: testing/results/${fileName}`);

  return log;
}
