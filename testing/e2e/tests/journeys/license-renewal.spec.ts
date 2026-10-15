import type { Page } from "@playwright/test";
import { test, expect, loginAsNewStudent } from "../../support/studentApp.ts";
import { confirmAndSubmit, openAdminContext, openDialogBy } from "../../support/adminApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableContract,
  createDisposableStudent,
  type AuthFixture,
} from "../../support/authFixtures.ts";

/**
 * 既存顧客の契約継続（アプリのみ契約）（ジャーニー: e2e/journeys/license-renewal.md）
 *
 * 使い捨ての顧客に、終了が10日後に迫った現行の契約と、そのライセンスを持つ生徒2人（継続する生徒・継続しない生徒）を作る。
 * アドミンの画面操作で継続用の契約を登録し、継続する生徒だけにライセンスを割り当て、継続前の生徒の見え方を確かめる。
 * 継続後（次期の開始日以降）は時刻を進められないため、2つの契約とライセンスの期間を11日前へずらして
 * 「現行が昨日で終わり、次期が今日から始まった」状態を作る。
 * ライブ付き契約の次期の専属コーチの申請（ステップ5）は tests/matching/coach-matching-contracts.spec.ts で確かめる。
 */

const PASSWORD = "Renewal2026a";
const DAY_MS = 24 * 60 * 60 * 1000;
const NO_LICENSE_MESSAGE = "有効なライセンスが見つかりません。管理者にお問い合わせください。";

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** 日本時間で今日から days 日後の日付（YYYY-MM-DD） */
const jstDate = (days: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date(Date.now() + days * DAY_MS));
/** 契約・ライセンスの期間（アプリと同じく、開始日の 0:00〜終了日の 23:59:59.999、日本時間） */
const jstPeriod = (startDays: number, endDays: number) => ({
  start: new Date(`${jstDate(startDays)}T00:00:00+09:00`),
  end: new Date(`${jstDate(endDays)}T23:59:59.999+09:00`),
});

/** ホームのご契約プランのカード */
const planCard = (page: Page) => page.locator("section").filter({ has: page.getByRole("heading", { name: "ご契約プラン" }) });

async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
}

async function tryLogin(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.locator("input[name=password]").press("Enter");
}

test("継続用の契約を登録して継続する生徒だけに割り当てると、継続した生徒は切れ目なく使え、継続しない生徒は終了後にログインできない", async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、admin は別コンテキストで開くため desktop だけで実行する");
  test.setTimeout(240_000);

  const f: AuthFixture = await createAuthFixture("renewal");
  fixture = f;
  const clientName = `【QAテスト】認証E2E（${f.tag}）`;

  // 現行の契約（170日前〜10日後。終了の14日前の案内が出る時期）と、そのライセンスを持つ生徒2人
  const current = jstPeriod(-170, 10);
  const { contractId: currentContractId } = await createDisposableContract(f, { planCode: "BLUEPRINT_ONLY", label: "現行", maxLicenses: 2, ...current });
  const students = await Promise.all(
    (["continue", "leave"] as const).map(async (kind) => {
      const email = `${f.tag}-${kind}@${DISPOSABLE_EMAIL_DOMAIN}`;
      const userName = `E2E継続（${kind}・${f.tag}）`;
      const userId = await createDisposableStudent(f, { email, password: PASSWORD, userName });
      const { error } = await f.admin.from("com_t_user_license").insert({
        contract_id: currentContractId,
        user_id: userId,
        status: 1,
        start_date: current.start.toISOString(),
        end_date: current.end.toISOString(),
      });
      if (error) throw new Error(`ライセンスの付与に失敗しました: ${error.message}`);
      return { email, userName, userId };
    })
  );
  const [continuing, leaving] = students;
  // 継続する生徒の学習履歴（通算の実施日数。継続後も引き継がれることを確かめる）
  const { error: statsError } = await f.admin.from("student_m_training_lifetime_stats").upsert({
    user_id: continuing.userId,
    total_active_days: 37,
    first_training_date: jstDate(-160),
    last_training_date: jstDate(-1),
  });
  if (statsError) throw new Error(`学習履歴の作成に失敗しました: ${statsError.message}`);

  const renewal = jstPeriod(11, 190);
  const { context: adminContext, page: adminPage } = await openAdminContext(browser);
  let renewalContractId = "";

  await test.step("1. アドミン: 継続用の契約を登録する（開始日は現行の終了日の翌日）", async () => {
    await adminPage.goto(`/contracts?clientId=${f.clientId}`);
    const dialog = await openDialogBy(adminPage, adminPage.getByRole("button", { name: "新規登録" }));
    await dialog.getByRole("combobox").first().click();
    await adminPage.getByPlaceholder("顧客名で検索...").fill(f.tag);
    await adminPage.getByRole("option", { name: clientName }).click();
    await dialog.getByRole("combobox", { name: "プラン" }).click();
    await adminPage.getByRole("option", { name: /^アプリのみ/ }).click();
    await dialog.getByLabel("上限ライセンス数").fill("1");
    await dialog.getByLabel("開始日").fill(jstDate(11));
    await dialog.getByLabel("終了日").fill(jstDate(190));
    await confirmAndSubmit(adminPage, /登録内容を確認する/, "契約を登録しました");

    const { data: contract } = await f.admin
      .from("com_m_contract").select("contract_id, start_date, end_date").eq("client_id", f.clientId).neq("contract_id", currentContractId).single();
    renewalContractId = contract!.contract_id;
    expect(new Date(contract!.start_date).getTime()).toBe(renewal.start.getTime());
    expect(new Date(contract!.end_date).getTime()).toBe(renewal.end.getTime());

    const row = adminPage.getByRole("row").filter({ hasText: "開始待ち" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/0\s*\/\s*1/);
  });

  await test.step("2. アドミン: 継続する生徒だけに、継続用の契約のライセンスを割り当てる", async () => {
    const row = adminPage.getByRole("row").filter({ hasText: "開始待ち" });
    const dialog = await openDialogBy(adminPage, row.getByText("/ 1", { exact: true }));
    await dialog.getByRole("button", { name: "ユーザーを追加" }).click();
    // 同じ顧客の生徒が追加の候補に出る（期間が重ならないため、現行のライセンスを持つ生徒も割り当てられる）
    await expect(dialog.getByText(leaving.userName)).toBeVisible();
    const candidate = dialog.locator("div").filter({ has: adminPage.getByText(continuing.userName, { exact: true }) }).filter({ has: adminPage.getByRole("button", { name: "追加" }) }).last();
    await candidate.getByRole("button", { name: "追加" }).click();
    await expect(adminPage.getByText("ユーザーを追加しました")).toBeVisible();
    await adminPage.keyboard.press("Escape");

    // ライセンスの期間は契約期間いっぱい。現行と次期の2件が並ぶ
    const { data: licenses } = await f.admin
      .from("com_t_user_license").select("contract_id, start_date, end_date, status").eq("user_id", continuing.userId).order("start_date");
    expect(licenses?.map((l) => l.contract_id)).toEqual([currentContractId, renewalContractId]);
    expect(new Date(licenses![1].start_date).getTime()).toBe(renewal.start.getTime());
    expect(new Date(licenses![1].end_date).getTime()).toBe(renewal.end.getTime());
    const { count } = await f.admin.from("com_t_user_license").select("license_id", { count: "exact", head: true }).eq("user_id", leaving.userId);
    expect(count).toBe(1);

    await adminPage.reload();
    await expect(adminPage.getByRole("row").filter({ hasText: "開始待ち" })).toContainText(/1\s*\/\s*1/);
  });

  await adminContext.close();

  await test.step("3. 生徒（継続前）: 継続する生徒は現行と次期が並び、終了の案内が出ない。継続しない生徒には案内が出る", async () => {
    await loginAsNewStudent(page, continuing.email, PASSWORD);
    const plans = planCard(page).getByRole("listitem");
    await expect(plans).toHaveCount(2);
    await expect(plans.nth(0)).toContainText(/残り\d+日/);
    await expect(plans.nth(1)).toContainText("開始前");
    await expect(planCard(page).getByText(/でご契約が終了します$/)).toHaveCount(0);

    await logout(page);
    await loginAsNewStudent(page, leaving.email, PASSWORD);
    await expect(planCard(page).getByRole("listitem")).toHaveCount(1);
    await expect(planCard(page).getByText(/でご契約が終了します$/)).toBeVisible();
    await logout(page);
  });

  await test.step("4. 生徒（継続後）: 次期の開始日以降もログインでき、ご契約プランは次期だけになる。学習履歴は引き継がれる", async () => {
    // 時刻を進められないため、2つの契約とライセンスの期間を11日前へずらす（現行は昨日で終了、次期は今日から）
    const shift = (iso: string) => new Date(new Date(iso).getTime() - 11 * DAY_MS).toISOString();
    for (const table of ["com_m_contract", "com_t_user_license"] as const) {
      const { data: rows } = await f.admin
        .from(table).select(`${table === "com_m_contract" ? "contract_id" : "license_id"}, start_date, end_date`)
        .in("contract_id", [currentContractId, renewalContractId])
        // 先に現行をずらす（次期を先にずらすと、一時的に現行と期間が重なり、有効なライセンスの重なりの制約に掛かる）
        .order("start_date");
      for (const row of rows ?? []) {
        const key = table === "com_m_contract" ? "contract_id" : "license_id";
        const id = (row as Record<string, string>)[key];
        const { error } = await f.admin.from(table).update({ start_date: shift(row.start_date), end_date: shift(row.end_date) }).eq(key, id);
        if (error) throw new Error(`期間の変更に失敗しました（${table}）: ${error.message}`);
      }
    }

    await tryLogin(page, continuing.email);
    await page.waitForURL("**/dashboard");
    const plans = planCard(page).getByRole("listitem");
    await expect(plans).toHaveCount(1);
    await expect(plans).toContainText(/残り\d+日/);
    await expect(planCard(page).getByText(/でご契約が終了します$/)).toHaveCount(0);
    const lifetime = page.locator("section").filter({ has: page.getByRole("heading", { name: "これまでの歩み" }) });
    await expect(lifetime).toContainText("37");
    await logout(page);

    // 継続しなかった生徒は、現行の終了後はログインできない
    await tryLogin(page, leaving.email);
    await expect(page.getByText(NO_LICENSE_MESSAGE)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
