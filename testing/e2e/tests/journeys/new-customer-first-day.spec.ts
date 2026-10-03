import { test, expect, navTab, agreeToPendingTerms } from "../../support/studentApp.ts";
import { confirmAndSubmit, openAdminContext } from "../../support/adminApp.ts";
import { cleanupAuthFixture, newTag, trackUserByEmail, type AuthFixture } from "../../support/authFixtures.ts";
import { resendTestAddress } from "../../support/resendInbox.ts";
import { createAdminClient } from "../../../helpers/auth.ts";

/**
 * 新規顧客の受注〜生徒の初日（ジャーニー: e2e/journeys/new-customer-onboarding.md → student-first-day.md）
 *
 * アドミンの画面操作で顧客・契約・汎用スプリントの公開先・生徒のCSV一括登録を行い、
 * 生徒が招待から本登録してホーム・ライブラリ・スプリントの設定画面まで進めることを確かめる。
 * - データはすべて使い捨て（顧客 `【QAテスト】認証E2E（<tag>）`）。後始末は cleanupAuthFixture。
 * - 一括登録は実際に招待メールを送るため、宛先は Resend のテスト用アドレスにする（FIXTURES.md）。
 * - トレーニングの実施・記録の反映は音声の入出力が必要なため対象外（ジャーニーのステップ7は設定画面まで）。
 */

const PASSWORD = "Onboard2026a";

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;

test.afterAll(async () => {
  await cleanupAuthFixture(fixture);
});

test("アドミンが受注処理をした顧客の生徒が、招待から最初のトレーニングの開始まで進める", async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  test.setTimeout(240_000);

  const tag = newTag("onb");
  const admin = await createAdminClient();
  fixture = { admin, tag, clientId: "", userIds: [], invitationEmails: [] };
  const clientName = `【QAテスト】認証E2E（${tag}）`;
  const studentEmail = resendTestAddress(`${tag}-student`);
  fixture.invitationEmails.push(studentEmail);

  // 汎用スプリント（限定公開。受注時に全顧客へ公開先を割り当てる教材）
  const { data: genericSprint, error: sprintError } = await admin
    .from("com_m_contents")
    .select("content_id, content_name")
    .eq("content_type", 2)
    .eq("content_scope", 1)
    .eq("metadata->sprint->>sprint_type", "0")
    .limit(1)
    .single();
  if (sprintError || !genericSprint) throw new Error(`汎用スプリントが見つかりません: ${sprintError?.message}`);

  const { context: adminContext, page: adminPage } = await openAdminContext(browser);

  await test.step("受注2: 顧客を登録する", async () => {
    await adminPage.goto("/clients");
    await adminPage.getByRole("button", { name: "新規登録" }).click();
    await adminPage.getByRole("dialog").getByLabel("顧客名称").fill(clientName);
    await confirmAndSubmit(adminPage, /登録内容を確認する/, "顧客を登録しました");

    const { data: client } = await admin.from("com_m_client").select("client_id").eq("client_name", clientName).single();
    fixture!.clientId = client!.client_id;
  });

  await test.step("受注3: 契約を登録する（アプリのみ）", async () => {
    await adminPage.goto("/contracts");
    await adminPage.getByRole("button", { name: "新規登録" }).click();
    const dialog = adminPage.getByRole("dialog");
    // 対象顧客の検索式セレクトはラベルと関連付いていないため、先頭の選択欄として扱う
    await dialog.getByRole("combobox").first().click();
    await adminPage.getByPlaceholder("顧客名で検索...").fill(tag);
    await adminPage.getByRole("option", { name: clientName }).click();
    await dialog.getByRole("combobox", { name: "プラン" }).click();
    await adminPage.getByRole("option", { name: /^アプリのみ/ }).click();
    await dialog.getByLabel("上限ライセンス数").fill("3");
    await confirmAndSubmit(adminPage, /登録内容を確認する/, "契約を登録しました");

    const { data: contracts } = await admin.from("com_m_contract").select("status, max_licenses").eq("client_id", fixture!.clientId);
    expect(contracts).toEqual([{ status: 1, max_licenses: 3 }]);
  });

  await test.step("受注4: 汎用スプリントの公開先に顧客を追加する", async () => {
    await adminPage.goto(`/contents?q=${encodeURIComponent(genericSprint.content_name)}`);
    const row = adminPage.getByRole("row").filter({ hasText: genericSprint.content_name });
    await row.getByText("限定", { exact: true }).click();
    const dialog = adminPage.getByRole("dialog");
    await dialog.getByRole("button", { name: "顧客を追加" }).click();
    await dialog.locator("div").filter({ has: adminPage.getByText(clientName, { exact: true }) }).last().getByRole("button", { name: "追加" }).click();
    await expect(adminPage.getByText("アクセス権限を付与しました")).toBeVisible();
    await adminPage.keyboard.press("Escape");
  });

  await test.step("受注5: 生徒をCSV一括登録する（初期ライセンスに契約を選ぶ）", async () => {
    await adminPage.goto("/users");
    await adminPage.getByRole("button", { name: "一括登録" }).click();
    const dialog = adminPage.getByRole("dialog");
    await dialog.getByRole("combobox").first().click();
    await adminPage.getByPlaceholder("顧客名で検索...").fill(tag);
    await adminPage.getByRole("option", { name: clientName }).click();
    await dialog.getByRole("combobox").nth(1).click();
    await adminPage.getByRole("option", { name: new RegExp(`認証E2E（${tag}）`) }).click();
    await dialog.locator("input[type=file]").setInputFiles({
      name: "students.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`email,user_name\n${studentEmail},E2E受注（${tag}）\n`, "utf-8"),
    });
    await dialog.getByRole("button", { name: "一括登録を開始" }).click();
    await expect(dialog.getByText("データ作成済")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText("メール送信済")).toBeVisible();

    // 招待の時点ではライセンスは付かない（本登録の時点で付く）
    const { data: invitation } = await admin.from("com_t_invitation").select("contract_id, accepted_at").eq("email", studentEmail).single();
    expect(invitation?.contract_id).not.toBeNull();
    expect(invitation?.accepted_at).toBeNull();
  });

  await adminContext.close();

  await test.step("初日1〜2: 招待リンクから本登録してホームへ移る", async () => {
    const { data: invitation } = await admin.from("com_t_invitation").select("token").eq("email", studentEmail).single();
    await page.goto(`/auth/invite?token=${invitation!.token}`);
    await page.getByLabel("新しいパスワード", { exact: true }).fill(PASSWORD);
    await page.getByLabel("新しいパスワード（確認用）").fill(PASSWORD);
    await page.getByRole("button", { name: "本登録を完了する" }).click();
    await page.waitForURL("**/dashboard");

    const userId = await trackUserByEmail(fixture!, studentEmail);
    expect(userId).not.toBeNull();
    const { data: license } = await admin.from("com_t_user_license").select("status").eq("user_id", userId!);
    expect(license).toEqual([{ status: 1 }]);
    const { data: progress } = await admin
      .from("student_m_sprint_progress").select("level_speed, level_structure, level_managed").eq("user_id", userId!).single();
    // アプリのみ契約はレベル管理しない（全レベルを選べる）
    expect(progress).toEqual({ level_speed: 0, level_structure: 0, level_managed: false });
  });

  await test.step("初日3: 利用規約に同意する", async () => {
    // 新規の生徒には必ず出る（同意するまでホームを操作できない）。表示を待ってから利用者と同じ操作で同意する
    const termsDialog = page.getByRole("dialog", { name: "利用規約への同意" });
    await expect(termsDialog).toBeVisible();
    expect(await agreeToPendingTerms(page)).toBe(true);
    await expect(termsDialog).toHaveCount(0);
  });

  await test.step("初日5: ホーム（アプリのみ契約の初日）", async () => {
    await expect(page.getByText("アプリのみ").first()).toBeVisible();
    await expect(navTab(page, "ライブセッション")).toHaveCount(0);
  });

  await test.step("初日6〜7: ライブラリから汎用スプリントの設定画面を開く", async () => {
    await page.goto("/library");
    // 教材カード（教材名と「トレーニングを始める」を含む最も内側の要素）
    const startButton = page.getByRole("button", { name: "トレーニングを始める" });
    const card = page.locator("div").filter({ has: page.getByText(genericSprint.content_name, { exact: true }) }).filter({ has: startButton }).last();
    await card.getByRole("button", { name: "トレーニングを始める" }).click();
    await page.waitForURL("**/training/sprint/play**");
    await expect(page.getByRole("button", { name: "種別・レベル・時間を変更" })).toBeVisible();
  });
});
