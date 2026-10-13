import { expect, test, type Page } from "@playwright/test";
import { openAdminContext } from "../../support/adminApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableCoach,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { clickUntilVisible } from "../../support/hydration.ts";

/**
 * アドミンのマッチング対象の設定（ユーザー詳細の「マッチング」タブ。画面: docs/screens/admin/users.md、
 * 機能: e2e/specs/matching/coach-matching.md「アドミンのマッチング対象の設定」）の内訳の表示と英語の文言。
 * - 内訳: 必須項目（未設定の項目）・コーチ本人の受付・デモコーチの注記
 * - 英語表示（NEXT_LOCALE=en）: 内訳・休止の文言と、休止・解除の保存
 *
 * 休止と理由のメモの保存（日本語）は tests/matching/coach-visibility.spec.ts で確かめている。
 * コーチは使い捨て（未設定の項目あり・受付OFF のコーチと、すべてそろったデモコーチ）。admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = "AdminMatch2026a";
const AVAILABILITY = [{ dayOfWeek: 5, startTime: "10:00:00", endTime: "13:00:00" }];

let fixture: AuthFixture | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する");
});

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** 未設定の項目（学歴・自己紹介・空き時間）があり、本人が受付を OFF にしたコーチと、すべてそろったデモコーチを作る */
async function createCoaches(): Promise<{ f: AuthFixture; incompleteId: string; demoId: string }> {
  const f = await createAuthFixture("adminmatch");
  fixture = f;
  const incompleteId = await createDisposableCoach(f, {
    email: `${f.tag}-coach-i@${DISPOSABLE_EMAIL_DOMAIN}`, password: PASSWORD, userName: `E2E Coach Incomplete ${f.tag}`, timezone: "Asia/Tokyo", availability: [],
  });
  const { error } = await f.admin
    .from("com_m_coach_profile").update({ education: "", introduction: "", accepting_students: false }).eq("user_id", incompleteId);
  if (error) throw new Error(`プロフィールの更新に失敗しました: ${error.message}`);

  const demoId = await createDisposableCoach(f, {
    email: `${f.tag}-coach-d@${DISPOSABLE_EMAIL_DOMAIN}`, password: PASSWORD, userName: `E2E Coach Demo ${f.tag}`, timezone: "Asia/Tokyo", availability: AVAILABILITY,
  });
  const { error: roleError } = await f.admin.from("com_t_user_role").insert({ user_id: demoId, role_id: "demo_user" });
  if (roleError) throw new Error(`デモのロールの付与に失敗しました: ${roleError.message}`);
  return { f, incompleteId, demoId };
}

/** 内訳の区画（見出しの h3 を持つ section。外側のカードの section も一致するため、内側を選ぶ） */
const breakdown = (page: Page, heading: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 3, name: heading }) }).last();

test("内訳に未設定の項目・本人の受付・デモコーチの注記が出る（日本語）", async ({ browser }) => {
  test.setTimeout(150_000);
  const { incompleteId, demoId } = await createCoaches();
  const { context, page } = await openAdminContext(browser);
  try {
    await test.step("未設定の項目があり受付OFFのコーチ: 非表示で、未設定の項目と受付の停止が出る", async () => {
      await page.goto(`/users/${incompleteId}/matching`);
      await expect(page.getByText("生徒のコーチ選択に非表示", { exact: true })).toBeVisible();
      const required = breakdown(page, "プロフィールの必須項目");
      await expect(required).toContainText("次の項目が未設定です（コーチ本人が設定します）");
      await expect(required.getByRole("listitem")).toHaveText(["学歴", "自己紹介", "空き時間（1件以上）"]);
      await expect(breakdown(page, "コーチ本人の新規受付")).toContainText("停止中（コーチ本人がOFFにしています）");
      await expect(page.getByText("デモコーチのため、デモの生徒にだけ表示されます")).toHaveCount(0);
    });

    await test.step("すべてそろったデモコーチ: 表示中で、すべて設定済み・受付中・デモコーチの注記が出る", async () => {
      await page.goto(`/users/${demoId}/matching`);
      await expect(page.getByText("生徒のコーチ選択に表示中", { exact: true })).toBeVisible();
      await expect(page.getByText("デモコーチのため、デモの生徒にだけ表示されます")).toBeVisible();
      await expect(breakdown(page, "プロフィールの必須項目")).toContainText("すべて設定済み");
      await expect(breakdown(page, "コーチ本人の新規受付")).toContainText("受付中");
    });
  } finally {
    await context.close();
  }
});

test("英語表示でも内訳・休止の文言が出て、休止と解除を保存できる", async ({ browser }) => {
  test.setTimeout(150_000);
  const { f, incompleteId, demoId } = await createCoaches();
  const { context, page } = await openAdminContext(browser, { locale: "en" });
  try {
    await test.step("未設定の項目があり受付OFFのコーチ", async () => {
      await page.goto(`/users/${incompleteId}/matching`);
      await expect(page.getByText("Hidden from the students' coach search", { exact: true })).toBeVisible();
      const required = breakdown(page, "Required profile items");
      await expect(required).toContainText("The following items are not set (the coach sets them)");
      await expect(required.getByRole("listitem")).toHaveText(["Education", "Personal introduction", "Availability (at least one slot)"]);
      await expect(breakdown(page, "Coach's own setting for new students")).toContainText("Not accepting (turned off by the coach)");
    });

    await test.step("デモコーチ: 表示中・注記・すべて設定済み・受付中", async () => {
      await page.goto(`/users/${demoId}/matching`);
      await expect(page.getByText("Visible in the students' coach search", { exact: true })).toBeVisible();
      await expect(page.getByText("Demo coach: shown only to demo students")).toBeVisible();
      await expect(breakdown(page, "Required profile items")).toContainText("All set");
      await expect(breakdown(page, "Coach's own setting for new students")).toContainText("Accepting");
    });

    await test.step("休止すると理由の欄・休止の開始日時が英語で出て、解除できる", async () => {
      const suspendSwitch = page.getByRole("switch", { name: "Pause by admins" });
      const noteInput = page.getByLabel("Reason (internal note; not shown to the coach)");
      await expect(page.getByText(/^While paused, the coach is hidden from the students' coach search/)).toBeVisible();
      await clickUntilVisible(suspendSwitch, noteInput);
      await expect(noteInput).toHaveAttribute("placeholder", "e.g. On leave until the end of October");
      await noteInput.fill(`On leave (${f.tag})`);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Matching paused")).toBeVisible();
      await expect(page.getByText(/^Paused since /)).toBeVisible();
      await expect(page.getByText("Hidden from the students' coach search", { exact: true })).toBeVisible();

      await suspendSwitch.click();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Matching resumed")).toBeVisible();
      await expect(page.getByText("Visible in the students' coach search", { exact: true })).toBeVisible();
      const { count } = await f.admin.from("com_m_coach_matching_suspension").select("coach_id", { count: "exact", head: true }).eq("coach_id", demoId);
      expect(count).toBe(0);
    });
  } finally {
    await context.close();
  }
});
