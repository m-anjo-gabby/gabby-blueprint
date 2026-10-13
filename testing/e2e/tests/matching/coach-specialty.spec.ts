import type { Page } from "@playwright/test";
import { openAdminContext } from "../../support/adminApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableCoach,
  createDisposableStudent,
  grantLiveLicense,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { openCoachContext } from "../../support/coachApp.ts";
import { expect, loginAsNewStudent, test } from "../../support/studentApp.ts";

/**
 * コーチの専門（仕様書: e2e/specs/matching/coach-matching.md の前提条件・E2Eテストケース候補「コーチの専門」）。
 * - アドミンがユーザー詳細の「専門」で分野（4つまで）と得意分野（発音プロ。上限に数えない）を設定する
 * - コーチのプロフィールには参照のみで出る（変更の操作が無い）
 * - 生徒の「専属コーチを探す」の絞り込み: 分野はどれかに当てはまればよく（または）、得意分野は持っているコーチだけ（かつ）
 *
 * コーチ・生徒は使い捨て（マスタの分野・得意分野は dev の初期データ）。coach・admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = "CoachSpecialty2026a";
const DAY_MS = 24 * 60 * 60 * 1000;
const AVAILABILITY = [{ dayOfWeek: 5, startTime: "10:00:00", endTime: "13:00:00" }];

let fixture: AuthFixture | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、coach・admin は PC 表示の別コンテキストで開くため desktop だけで実行する");
});

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

const coachCard = (page: Page, coachName: string) => page.getByLabel(`${coachName}のプロフィールを見る`);
const specialtyFilter = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("アドミンが設定した専門がコーチのプロフィールに参照のみで出て、生徒は専門で絞り込める", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const f = await createAuthFixture("coachspecialty");
  fixture = f;
  const studentEmail = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password: PASSWORD });
  await grantLiveLicense(f, studentId, { planCode: "LIVE_WEEKLY1_3M", label: "live", start: new Date(Date.now() - DAY_MS), end: new Date(Date.now() + 90 * DAY_MS) });
  const coach = (key: string) => ({ name: `E2E Coach ${key} ${f.tag}`, email: `${f.tag}-coach-${key.toLowerCase()}@${DISPOSABLE_EMAIL_DOMAIN}` });
  const [none, multi, media] = [coach("None"), coach("Multi"), coach("Media")];
  await createDisposableCoach(f, { ...none, userName: none.name, password: PASSWORD, timezone: "Asia/Tokyo", availability: AVAILABILITY });
  const multiId = await createDisposableCoach(f, { ...multi, userName: multi.name, password: PASSWORD, timezone: "Asia/Tokyo", availability: AVAILABILITY });
  const mediaId = await createDisposableCoach(f, { ...media, userName: media.name, password: PASSWORD, timezone: "Asia/Tokyo", availability: AVAILABILITY });
  // 比較用のコーチ（メディアだけ）は直接設定する
  const { error } = await f.admin.from("com_m_coach_specialty_assignment").insert({ coach_id: mediaId, specialty_code: "media" });
  if (error) throw new Error(`専門の設定に失敗しました: ${error.message}`);

  await test.step("アドミン: 分野は4つまで選べ、得意分野は上限に数えない", async () => {
    const { context, page: adminPage } = await openAdminContext(browser);
    try {
      await adminPage.goto(`/users/${multiId}/specialty`);
      for (const name of ["ビジネス", "金融", "テクノロジー"]) await adminPage.getByRole("checkbox", { name }).check();
      await expect(adminPage.getByText("3 / 4")).toBeVisible();
      await expect(adminPage.getByRole("checkbox", { name: "ジャーナリズム" })).toBeEnabled();
      await adminPage.getByRole("checkbox", { name: "エンジニアリング" }).check();
      await expect(adminPage.getByText("4 / 4")).toBeVisible();
      // 4つ選ぶと、残りの分野は選べない。得意分野は選べる
      await expect(adminPage.getByRole("checkbox", { name: "ジャーナリズム" })).toBeDisabled();
      await expect(adminPage.getByRole("checkbox", { name: "メディア" })).toBeDisabled();
      await adminPage.getByRole("checkbox", { name: "発音プロ" }).check();
      await adminPage.getByRole("button", { name: "保存" }).click();
      await expect(adminPage.getByText("専門を保存しました")).toBeVisible();
    } finally {
      await context.close();
    }
    const { data } = await f.admin.from("com_m_coach_specialty_assignment").select("specialty_code").eq("coach_id", multiId);
    expect((data ?? []).map((r) => r.specialty_code).sort()).toEqual(["business", "engineering", "finance", "pronunciation_pro", "tech"]);
  });

  await test.step("コーチ: プロフィールに専門が参照のみで出る", async () => {
    const { context, page: coachPage } = await openCoachContext(browser, { email: multi.email, password: PASSWORD });
    try {
      await coachPage.goto("/profile");
      const group = coachPage.getByText("Your specialties are set by the Gabby team", { exact: false }).locator("..");
      for (const label of ["Pronunciation Pro", "Business", "Finance", "Tech", "Engineering"]) {
        await expect(group.getByText(label, { exact: true })).toBeVisible();
      }
      await expect(group.getByText("Not set yet")).toHaveCount(0);
      await expect(group.getByRole("checkbox")).toHaveCount(0);
      await expect(group.getByRole("button")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  await test.step("生徒: 分野は「または」、得意分野は「かつ」で絞り込む", async () => {
    await loginAsNewStudent(page, studentEmail, PASSWORD);
    await page.goto("/coach-matching");
    await page.getByPlaceholder("コーチ名で検索").fill(f.tag);
    await expect(coachCard(page, none.name)).toBeVisible();
    await expect(coachCard(page, multi.name)).toBeVisible();
    await expect(coachCard(page, media.name)).toBeVisible();

    await specialtyFilter(page, "ビジネス").click();
    await expect(specialtyFilter(page, "ビジネス")).toHaveAttribute("aria-pressed", "true");
    await expect(coachCard(page, multi.name)).toBeVisible();
    await expect(coachCard(page, none.name)).toHaveCount(0);
    await expect(coachCard(page, media.name)).toHaveCount(0);

    await specialtyFilter(page, "メディア").click();
    await expect(coachCard(page, multi.name)).toBeVisible();
    await expect(coachCard(page, media.name)).toBeVisible();
    await expect(coachCard(page, none.name)).toHaveCount(0);

    await specialtyFilter(page, "発音プロ").click();
    await expect(coachCard(page, multi.name)).toBeVisible();
    await expect(coachCard(page, media.name)).toHaveCount(0);
    await expect(coachCard(page, none.name)).toHaveCount(0);

    await page.getByRole("button", { name: "リセット" }).click();
    await expect(coachCard(page, none.name)).toBeVisible();
    await expect(coachCard(page, media.name)).toBeVisible();
  });
});
