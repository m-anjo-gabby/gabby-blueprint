import { test, expect } from "../../support/studentApp.ts";
import { openAdminContext, openDialogBy } from "../../support/adminApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableContract,
  createDisposableStudent,
  createInvitation,
  type AuthFixture,
} from "../../support/authFixtures.ts";

/**
 * アドミンのユーザーの新規登録（招待・即時作成）で、使われているメールアドレスを弾く（画面: docs/screens/admin/users.md）。
 * どちらも登録に失敗する操作のため、メールは送られない。
 * - 即時作成したユーザー（招待の行が無い）のアドレスへの招待は「登録済み」で止める（大文字小文字の違いも同じアドレスとして扱う）
 * - 本登録前の招待があるアドレスでの即時作成は「招待中」で止める（作ると残った招待のリンクで本登録できなくなる）
 */

const DAY_MS = 24 * 60 * 60 * 1000;

let fixture: AuthFixture | undefined;

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "アドミンの画面操作は desktop だけで確かめる");
  fixture = await createAuthFixture("dup");
  // 生徒の新規登録は初期ライセンスの選択が必須のため、使い捨ての顧客にアプリのみの契約を用意する
  await createDisposableContract(fixture, { planCode: "BLUEPRINT_ONLY", label: "app" });
});

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

async function fillBasicFields(dialog: import("@playwright/test").Locator, page: import("@playwright/test").Page, email: string) {
  await dialog.getByLabel("メールアドレス").fill(email);
  await dialog.getByLabel("氏名").fill(`E2E重複（${fixture!.tag}）`);
  await dialog.getByRole("combobox").filter({ hasText: "顧客を選択" }).click();
  await page.getByPlaceholder("顧客名で検索...").fill(fixture!.tag);
  await page.getByRole("option", { name: `【QAテスト】認証E2E（${fixture!.tag}）` }).click();
  const license = dialog.getByRole("combobox", { name: "初期ライセンス" });
  await expect(license).toBeEnabled();
  await license.click();
  await page.getByRole("option").first().click();
}

test("即時作成したユーザーのアドレスには招待を送れない（大文字小文字の違いも同じアドレス）", async ({ browser }) => {
  const email = `${fixture!.tag}-direct@${DISPOSABLE_EMAIL_DOMAIN}`;
  await createDisposableStudent(fixture!, { email, password: "DupPass2026a" });

  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto("/users");
    const dialog = await openDialogBy(page, page.getByRole("button", { name: "新規登録" }));
    await dialog.getByText("招待メールを送信").click();
    await fillBasicFields(dialog, page, email.toUpperCase());
    await dialog.getByRole("button", { name: "確認画面へ進む" }).click();
    await dialog.getByRole("button", { name: "確定して保存" }).click();
    await expect(dialog.getByText("登録済みメールです。").first()).toBeVisible();

    const { count } = await fixture!.admin.from("com_t_invitation").select("id", { count: "exact", head: true }).ilike("email", email);
    expect(count).toBe(0);
  } finally {
    await context.close();
  }
});

test("本登録前の招待があるアドレスでは即時作成できない", async ({ browser }) => {
  const email = `${fixture!.tag}-inviting@${DISPOSABLE_EMAIL_DOMAIN}`;
  await createInvitation(fixture!, { email, userName: "E2E招待中", expiresAt: new Date(Date.now() + 3 * DAY_MS) });

  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto("/users");
    const dialog = await openDialogBy(page, page.getByRole("button", { name: "新規登録" }));
    await dialog.getByText("即時作成").click();
    await fillBasicFields(dialog, page, email);
    await dialog.getByLabel("パスワード", { exact: true }).fill("DupPass2026a");
    await dialog.getByLabel("パスワード（確認用）").fill("DupPass2026a");
    await dialog.getByRole("button", { name: "確認画面へ進む" }).click();
    await dialog.getByRole("button", { name: "アカウントを作成する" }).click();
    await expect(dialog.getByText("招待中（本登録前）のメールアドレスです。招待メールを再送してください。").first()).toBeVisible();

    const { data } = await fixture!.admin.rpc("fn_find_auth_user_id_by_email", { p_email: email });
    expect(data).toBeNull();
  } finally {
    await context.close();
  }
});
