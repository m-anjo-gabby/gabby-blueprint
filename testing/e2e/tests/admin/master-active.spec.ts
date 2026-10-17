import type { Page } from "@playwright/test";
import { confirmAndSubmit, openAdminContext, openDialogBy } from "../../support/adminApp.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableContract,
  createDisposableStudent,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { expect, test } from "../../support/studentApp.ts";

/**
 * 使用をやめる操作と、業務の記録がある行の削除の拒否（仕様書: e2e/specs/admin/data-deletion.md フロー5〜7、異常系 #7・#10）。
 * - プラン: 販売終了の目印、契約で使われているプランは削除できない、使われていないプランは削除できる
 * - カレンダーイベント: 開催済みは削除できない
 * - 教材: 非公開にすると目印が付き、公開先の顧客の生徒にも表示されない
 * 固定のマスタ・教材は変えず、使い捨てのプラン・イベント・教材（使い捨ての顧客だけに限定公開）で確かめる。desktop だけで実行する。
 */

const PASSWORD = "MasterActive2026a";

let fixture: AuthFixture | undefined;
let cleanups: (() => PromiseLike<unknown>)[] = [];

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する");
});

test.afterEach(async () => {
  // 顧客の後始末（契約・公開先）を先に行い、その後に契約・公開先から参照されていたプラン・教材を消す
  await cleanupAuthFixture(fixture);
  for (const cleanup of cleanups.reverse()) await cleanup();
  fixture = undefined;
  cleanups = [];
});

/** 使い捨てのプラン（アプリのみ）。名前・コードにタグを含める */
async function createPlan(f: AuthFixture, label: string) {
  const plan = {
    plan_code: `E2E_${f.tag}_${label}`.toUpperCase(),
    plan_name: `E2Eプラン（${f.tag}・${label}）`,
    plan_name_en: `E2E plan ${f.tag} ${label}`,
    contract_type: 1,
    period_months: 3,
    sort_no: 999,
    has_dialogue_practice: false,
  };
  const { data, error } = await f.admin.from("com_m_contract_plan").insert(plan).select("plan_id").single();
  if (error) throw new Error(`プランの作成に失敗しました: ${error.message}`);
  cleanups.push(() => f.admin.from("com_m_contract_plan").delete().eq("plan_id", data.plan_id));
  return { ...plan, plan_id: data.plan_id as string };
}

const planRow = (page: Page, name: string) => page.getByRole("row").filter({ hasText: name });

test("プラン: 販売終了の目印が付き、契約で使われていると削除できず、使われていなければ削除できる", async ({ browser }) => {
  fixture = await createAuthFixture("planactive");
  const f = fixture;
  const used = await createPlan(f, "used");
  const unused = await createPlan(f, "unused");
  await createDisposableContract(f, { planCode: used.plan_code, label: "使用中のプラン" });

  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto(`/contracts/plans?q=${encodeURIComponent(f.tag)}`);
    await expect(planRow(page, used.plan_name)).toBeVisible();

    await test.step("販売中をオフにすると販売終了の目印が付く", async () => {
      const dialog = await openDialogBy(page, planRow(page, used.plan_name).getByRole("button", { name: "編集" }));
      await dialog.getByRole("switch").click();
      await confirmAndSubmit(page, /編集内容を確認する/, "プランを更新しました");
      await expect(planRow(page, used.plan_name).getByText("販売終了")).toBeVisible();
      const { data } = await f.admin.from("com_m_contract_plan").select("is_active").eq("plan_id", used.plan_id).single();
      expect(data?.is_active).toBe(false);
    });

    const deletePlan = async (name: string) => {
      const confirm = page.getByRole("alertdialog");
      await clickUntilVisible(planRow(page, name).getByRole("button", { name: "プランの削除" }), confirm);
      await confirm.getByRole("button", { name: "削除する" }).click();
    };

    await test.step("契約で使われているプランは削除できない", async () => {
      await deletePlan(used.plan_name);
      await expect(page.getByText("契約で使われているため削除できません。編集で「販売中」をオフにしてください")).toBeVisible();
      await expect(planRow(page, used.plan_name)).toBeVisible();
    });

    await test.step("使われていないプランは削除できる", async () => {
      await deletePlan(unused.plan_name);
      await expect(page.getByText("プランを削除しました")).toBeVisible();
      await expect(planRow(page, unused.plan_name)).toHaveCount(0);
      const { count } = await f.admin.from("com_m_contract_plan").select("plan_id", { count: "exact", head: true }).eq("plan_id", unused.plan_id);
      expect(count).toBe(0);
    });
  } finally {
    await context.close();
  }
});

test("カレンダーイベント: 開催済みのイベントは削除できない", async ({ browser }) => {
  fixture = await createAuthFixture("eventheld");
  const f = fixture;
  const title = `E2E開催済みのイベント（${f.tag}）`;
  const start = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const { data: event, error } = await f.admin
    .from("com_m_calendar_event")
    .insert({
      event_type: "GROUP_SESSION",
      title,
      start_datetime: start.toISOString(),
      end_datetime: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      target_type: "CLIENT",
      client_id: f.clientId,
      is_published: true,
    })
    .select("calendar_event_id")
    .single();
  if (error) throw new Error(`イベントの作成に失敗しました: ${error.message}`);

  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto(`/calendar-events?q=${encodeURIComponent(f.tag)}`);
    const row = page.getByRole("row").filter({ hasText: title });
    const confirm = page.getByRole("alertdialog");
    await clickUntilVisible(row.getByRole("button", { name: "カレンダーイベントの削除" }), confirm);
    await confirm.getByRole("button", { name: "削除する" }).click();
    await expect(page.getByText("開催済みのイベントは削除できません。参加の記録を残すため、編集で非公開にしてください")).toBeVisible();
    await expect(row).toBeVisible();
    const { count } = await f.admin
      .from("com_m_calendar_event")
      .select("calendar_event_id", { count: "exact", head: true })
      .eq("calendar_event_id", event.calendar_event_id);
    expect(count).toBe(1);
  } finally {
    await context.close();
  }
});

test("教材: 非公開にすると目印が付き、公開先の顧客の生徒にも表示されない", async ({ browser }) => {
  fixture = await createAuthFixture("contentstatus");
  const f = fixture;
  const email = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  await createDisposableStudent(f, { email, password: PASSWORD });
  const contentName = `E2E公開状態の教材（${f.tag}）`;
  const { data: content, error } = await f.admin
    .from("com_m_contents")
    .insert({ content_name: contentName, content_type: 0, content_scope: 1, status: 1, content_label: `e2e-${f.tag}`, seq_no: 999 })
    .select("content_id")
    .single();
  if (error) throw new Error(`教材の作成に失敗しました: ${error.message}`);
  cleanups.push(() => f.admin.from("com_m_contents").delete().eq("content_id", content.content_id));
  const { error: accessError } = await f.admin.from("com_m_contents_access").insert({ client_id: f.clientId, content_id: content.content_id });
  if (accessError) throw new Error(`公開先の設定に失敗しました: ${accessError.message}`);

  const studentSees = async () => {
    const student = await signInAsRole(email, PASSWORD);
    const { data } = await student.from("com_m_contents").select("content_id").eq("content_id", content.content_id);
    await signOutRole(student);
    return (data ?? []).length === 1;
  };
  expect(await studentSees()).toBe(true);

  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto(`/contents?q=${encodeURIComponent(f.tag)}`);
    const row = page.getByRole("row").filter({ hasText: contentName });
    const dialog = await openDialogBy(page, row.getByRole("button", { name: "基本情報を編集" }));
    await dialog.getByLabel("公開状態").click();
    await page.getByRole("option", { name: "非公開" }).click();
    await dialog.getByRole("button", { name: "内容を確認する" }).click();
    await dialog.getByRole("button", { name: "はい、確定します" }).click();
    await expect(page.getByText("教材を更新しました")).toBeVisible();
    await expect(row.getByText("非公開")).toBeVisible();
    expect(await studentSees()).toBe(false);
  } finally {
    await context.close();
  }
});
