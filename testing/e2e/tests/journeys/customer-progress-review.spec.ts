import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { test, expect, loginAsNewStudent, navTab } from "../../support/studentApp.ts";
import { openAdminContext, openDialogBy } from "../../support/adminApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableContract,
  createDisposableStudent,
  type AuthFixture,
} from "../../support/authFixtures.ts";

/**
 * 企業担当者による進捗確認（ジャーニー: e2e/journeys/customer-progress-review.md）
 *
 * 使い捨ての顧客に、今月（日本時間）に終わるアプリのみ契約と、そのライセンスを持つ担当者・受講生2人を作る。
 * アドミンが画面で担当者にモニターロールを付け、担当者が再ログインしてモニターで受講生の状況とCSVを確かめ、
 * アドミンがトレーニングレポート（PDF・ZIP）を作るまでを通す。
 * 受講生の記録はDBに直接作る（トレーニングの実施は音声の入出力が必要なため）。
 * 期間の区切り（日本時間）と実績の日付（生徒のタイムゾーン）は tests/monitoring/monitor-period.spec.ts で確かめる。
 */

const PASSWORD = "ProgressReview2026a";
const DAY_MS = 24 * 60 * 60 * 1000;

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;

test.afterEach(async () => {
  if (fixture) await fixture.admin.from("com_t_user_role").delete().in("user_id", fixture.userIds).eq("role_id", "monitor");
  // 記録・通算値は受講生の削除で連鎖削除される
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** 日本時間の今月の末日 23:59:59.999（今月に満了するライセンスの終了日時） */
function endOfJstMonth(): Date {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" })
    .format(new Date())
    .split("-")
    .map(Number);
  // 翌月1日 0:00 JST の 1ms 前
  return new Date(Date.UTC(year, month, 1, -9) - 1);
}

async function readDownload(download: Download): Promise<Buffer> {
  return readFile((await download.path())!);
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL("**/dashboard");
}

async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
}

test("アドミンが担当者にモニターロールを付けると、担当者が受講生の状況とCSVを確かめられ、アドミンがレポートを作れる", async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、admin は別コンテキストで開くため desktop だけで実行する");
  test.setTimeout(240_000);

  const f = await createAuthFixture("progress");
  fixture = f;
  const { admin } = f;

  // 今月に満了する契約（60日前〜今月末）と、そのライセンスを持つ担当者・受講生2人
  const period = { start: new Date(Date.now() - 60 * DAY_MS), end: endOfJstMonth() };
  const { contractId } = await createDisposableContract(f, { planCode: "BLUEPRINT_ONLY", label: "進捗確認", maxLicenses: 3, ...period });
  const createMember = async (kind: string, userName: string) => {
    const email = `${f.tag}-${kind}@${DISPOSABLE_EMAIL_DOMAIN}`;
    const userId = await createDisposableStudent(f, { email, password: PASSWORD, userName });
    const { error } = await admin.from("com_t_user_license").insert({
      contract_id: contractId,
      user_id: userId,
      status: 1,
      start_date: period.start.toISOString(),
      end_date: period.end.toISOString(),
    });
    if (error) throw new Error(`ライセンスの付与に失敗しました: ${error.message}`);
    return { email, userId, userName };
  };
  const manager = await createMember("manager", `E2E担当者（${f.tag}）`);
  const active = await createMember("active", `E2E受講生A（${f.tag}）`);
  const idle = await createMember("idle", `E2E受講生B（${f.tag}）`);

  // 受講生Aだけが今日スプリントを1本（5問回答）実施した
  const { data: sprint } = await admin.from("com_m_contents").select("content_id").eq("content_type", 2).eq("delete_flg", "0").limit(1).single();
  if (!sprint) throw new Error("スプリントの教材が見つかりません");
  const { error: sprintError } = await admin.from("self_t_sprint").insert({
    user_id: active.userId, sprint_type: "0", content_id: sprint.content_id, question_type: "0", answer_type: "0",
    difficulty_level: 1, time_limit_sec: 60, total_answered: 5, total_assessments: 0,
  });
  if (sprintError) throw new Error(`スプリントの記録の作成に失敗しました: ${sprintError.message}`);

  const { data: monitorRole } = await admin.from("com_m_role").select("role_name").eq("role_id", "monitor").single();
  if (!monitorRole) throw new Error("モニターロールが見つかりません");

  await test.step("前提: ロールの無い担当者にはモニターのタブが無く、URLを開いてもホームへ戻される", async () => {
    await loginAsNewStudent(page, manager.email, PASSWORD);
    await expect(navTab(page, "モニター")).toHaveCount(0);
    await page.goto("/monitor");
    await page.waitForURL("**/dashboard");
    await logout(page);
  });

  const { context: adminContext, page: adminPage } = await openAdminContext(browser);
  try {
    await test.step("1. アドミン: ユーザー管理で担当者にモニターロールを付ける", async () => {
      await adminPage.goto(`/users?q=${encodeURIComponent(manager.email)}`);
      const row = adminPage.getByRole("row").filter({ hasText: manager.email });
      const dialog = await openDialogBy(adminPage, row.getByRole("button", { name: "編集" }));
      await dialog.getByLabel(monitorRole.role_name, { exact: true }).check();
      await dialog.getByRole("button", { name: "確認画面へ進む" }).click();
      await dialog.getByRole("button", { name: "確定して保存" }).click();
      await expect(adminPage.getByText("ユーザー情報を更新しました")).toBeVisible();

      const { count } = await admin.from("com_t_user_role").select("user_id", { count: "exact", head: true }).eq("user_id", manager.userId).eq("role_id", "monitor");
      expect(count).toBe(1);
    });

    await test.step("2〜3. 担当者: 再ログインするとモニターのタブが出て、今月の受講生サマリーに受講生が並ぶ", async () => {
      // ロールはログイン時に読み込まれるため、ログインし直す（規約は同意済み）
      await login(page, manager.email);
      await navTab(page, "モニター").click();
      await page.waitForURL("**/monitor**");
      const main = page.getByRole("main");
      await expect(main.getByText(active.userName).first()).toBeVisible();
      await expect(main.getByText(idle.userName).first()).toBeVisible();
      // モニター用アカウント（担当者自身）は「モニターを含める」をオンにした時だけ出る
      await expect(main.getByText(manager.userName)).toHaveCount(0);
      await page.getByLabel("モニターを含める").click();
      await expect(main.getByText(manager.userName).first()).toBeVisible();
      await page.getByLabel("モニターを含める").click();
      await expect(main.getByText(manager.userName)).toHaveCount(0);
    });

    await test.step("6. 担当者: 受講生サマリーをCSVで出力する（BOM付きのUTF-8。実績のある受講生だけに回数が入る）", async () => {
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSVエクスポート" }).click()]);
      expect(download.suggestedFilename()).toMatch(/^blueprint_user_summary_\d{4}-\d{2}\.csv$/);
      const csv = (await readDownload(download)).toString("utf-8");
      expect(csv.startsWith("﻿")).toBe(true);
      const lines = csv.slice(1).split("\r\n");
      expect(lines[0]).toBe('"受講生","ステータス","ライセンス開始日","ライセンス終了日","トレーニング日数","フレーズ数","スプリント本数","スプリント回答数","発話数","最終実施日"');
      const cells = (name: string) => lines.find((l) => l.startsWith(`"${name}"`))?.split(",").map((c) => c.replace(/"/g, ""));
      expect(cells(active.userName)?.slice(4, 9)).toEqual(["1日", "0", "1", "5", "0"]);
      expect(cells(idle.userName)?.slice(4, 10)).toEqual(["0日", "0", "0", "0", "0", "なし"]);
      expect(cells(manager.userName)).toBeUndefined();
    });

    await test.step("7〜8. アドミン: トレーニングレポートで今月に満了する契約が並び、生徒のPDFと契約の全員分のZIPを作れる", async () => {
      await adminPage.goto("/training-reports");
      const { data: contract } = await admin.from("com_m_contract").select("contract_name").eq("contract_id", contractId).single();
      const section = adminPage.locator("section").filter({ has: adminPage.getByRole("heading", { name: contract!.contract_name }) });
      await expect(section).toContainText("この月に満了 3名");
      const row = section.getByRole("row").filter({ hasText: active.userName });
      await expect(row).toContainText("有効");
      await expect(row).toContainText("対象外");

      const [pdf] = await Promise.all([adminPage.waitForEvent("download", { timeout: 60_000 }), row.getByRole("button", { name: "PDF" }).click()]);
      expect(pdf.suggestedFilename()).toMatch(new RegExp(`^${active.userName.replace(/[()（）]/g, ".")}様_Gabbyトレーニングレポート_.+\\.pdf$`));
      expect((await readDownload(pdf)).subarray(0, 5).toString()).toBe("%PDF-");

      const [zip] = await Promise.all([
        adminPage.waitForEvent("download", { timeout: 120_000 }),
        section.getByRole("button", { name: "契約の全員分をZIPで作成" }).click(),
      ]);
      expect(zip.suggestedFilename()).toMatch(/\.zip$/);
      expect((await readDownload(zip)).subarray(0, 2).toString()).toBe("PK");
    });
  } finally {
    await adminContext.close();
  }
});
