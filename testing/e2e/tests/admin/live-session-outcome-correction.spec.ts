import { cleanupAuthFixture, createAuthFixture, deleteFixtureChatRooms, type AuthFixture } from "../../support/authFixtures.ts";
import { openAdminContext, openLiveSessionsFor } from "../../support/adminApp.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
import {
  approveMatchingRequest,
  createPendingMatchingRequest,
  createStaleSessions,
  signOutLivePair,
  type LivePair,
} from "../../support/liveSessionFixtures.ts";
import { expect, test } from "../../support/studentApp.ts";

/**
 * アドミンによるライブセッションの実施結果の記録・修正（機能: e2e/specs/session-lifecycle/session-completion.md の「アドミンの修正」）。
 *
 * コーチが記録しないまま終了予定を過ぎたセッションを、ライブセッション管理の実施済みタブから「コーチの欠席」として記録し、
 * 実施記録の一覧から「外部のZoomで実施した実施完了」へ修正する。チケットの消化・返還の差分、履歴、要確認の絞り込みを確かめる。
 * admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = "OutcomeFix2026a";

let fixture: AuthFixture | undefined;
let pair: LivePair | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する");
});

test.afterEach(async () => {
  await signOutLivePair(pair);
  pair = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

test("未記録のセッションをアドミンが記録・修正でき、チケットの消化・返還が差分で反映され、履歴が残る", async ({ browser }) => {
  test.setTimeout(180_000);
  const f = await createAuthFixture("outcomefix");
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);
  const [sessionId] = await createStaleSessions(f, p, scheduleId, 1);

  const usedSessions = async () => {
    const { data } = await f.admin.from("com_t_user_session_ticket").select("used_sessions").eq("ticket_id", p.ticketId).single();
    return data?.used_sessions;
  };

  const { context, page: admin } = await openAdminContext(browser);
  try {
    await test.step("ライブセッション管理: 実施済みタブに「未記録」として出て、「コーチの欠席」として記録すると返還のキャンセルになる", async () => {
      await openLiveSessionsFor(admin, { tag: f.tag, clientName: `【QAテスト】認証E2E（${f.tag}）`, studentName: p.studentName, studentEmail: p.studentEmail });
      await admin.getByRole("tab", { name: "実施済み" }).click();
      const row = admin.getByRole("tabpanel", { name: "実施済み" }).getByRole("listitem").filter({ hasText: "未記録" });
      await expect(row).toHaveCount(1);

      const dialog = admin.getByRole("dialog", { name: "実施結果の記録" });
      await clickUntilVisible(row.getByRole("button", { name: "結果を記録" }), dialog);
      await expect(dialog.getByTestId("session-outcome-evidence")).toContainText("コーチがアプリ内の通話に入った記録はありません");
      await expect(dialog.getByTestId("session-outcome-history")).toHaveCount(0);
      await dialog.getByRole("radio", { name: /^コーチの欠席/ }).check();
      await expect(dialog.getByRole("button", { name: "記録する" })).toBeDisabled();
      await dialog.getByRole("textbox").fill(`コーチから欠席の連絡あり（${f.tag}）`);
      await dialog.getByRole("button", { name: "記録する" }).click();
      await expect(admin.getByText("実施結果を保存しました")).toBeVisible();

      const { data } = await f.admin.from("com_t_session").select("status, cancel_category, ticket_refunded, ticket_consumed").eq("session_id", sessionId).single();
      expect(data).toMatchObject({ status: 3, cancel_category: 2, ticket_refunded: true, ticket_consumed: false });
      expect(await usedSessions()).toBe(0);
    });

    await test.step("実施記録: タグで探すと「コーチの欠席・アドミン確認済み」で出て、要確認だけにすると出ない", async () => {
      await admin.goto(`/live-sessions/records?q=${encodeURIComponent(f.tag)}`);
      await expect(admin.getByRole("heading", { level: 1, name: "実施記録" })).toBeVisible();
      const row = admin.getByRole("row").filter({ hasText: p.studentName });
      await expect(row).toContainText("キャンセル（コーチ）");
      await expect(row).toContainText("アドミン確認済み");
      await expect(row.getByText("要確認", { exact: true })).toHaveCount(0);

      await admin.goto(`/live-sessions/records?q=${encodeURIComponent(f.tag)}&review=1`);
      await expect(admin.getByText("該当する記録はありません")).toBeVisible();
    });

    await test.step("実施記録: 外部のZoomで実施した実施完了へ修正すると、チケットを消化し、履歴に記録と修正が並ぶ", async () => {
      await admin.goto(`/live-sessions/records?q=${encodeURIComponent(f.tag)}`);
      const row = admin.getByRole("row").filter({ hasText: p.studentName });
      const dialog = admin.getByRole("dialog", { name: "実施結果の修正" });
      await clickUntilVisible(row.getByRole("button", { name: "修正" }), dialog);
      await expect(dialog.getByRole("radio", { name: /^コーチの欠席/ })).toBeChecked();
      await expect(dialog.getByTestId("session-outcome-history")).toContainText("コーチから欠席の連絡あり");

      await dialog.getByRole("radio", { name: /^実施完了/ }).check();
      await dialog.getByRole("radio", { name: "外部のZoom" }).check();
      await dialog.getByRole("textbox").fill(`生徒から実施済みと連絡があり、コーチに確認（${f.tag}）`);
      await dialog.getByRole("button", { name: "修正する" }).click();
      await expect(admin.getByText("実施結果を保存しました")).toBeVisible();
      await expect(row).toContainText("実施済み");
      await expect(row).toContainText("外部のZoom");

      const { data } = await f.admin
        .from("com_t_session").select("status, completion_result, conducted_via, cancel_category, ticket_refunded, ticket_consumed")
        .eq("session_id", sessionId).single();
      expect(data).toMatchObject({ status: 2, completion_result: 1, conducted_via: 2, cancel_category: null, ticket_refunded: null, ticket_consumed: true });
      expect(await usedSessions()).toBe(1);

      const { data: history } = await f.admin
        .from("com_t_session_outcome_history").select("action, outcome, ticket_action").eq("session_id", sessionId).order("performed_at");
      expect(history).toEqual([
        { action: "corrected", outcome: 4, ticket_action: null },
        { action: "corrected", outcome: 1, ticket_action: "consumed" },
      ]);
    });

    await test.step("実施記録: 消化しない結果へ戻すとチケットを返還する", async () => {
      const row = admin.getByRole("row").filter({ hasText: p.studentName });
      const dialog = admin.getByRole("dialog", { name: "実施結果の修正" });
      await clickUntilVisible(row.getByRole("button", { name: "修正" }), dialog);
      await dialog.getByRole("radio", { name: /^通信トラブル等で実施できなかった/ }).check();
      await dialog.getByRole("textbox").fill(`再確認の結果、実施できていなかった（${f.tag}）`);
      await dialog.getByRole("button", { name: "修正する" }).click();
      await expect(admin.getByText("実施結果を保存しました").first()).toBeVisible();
      await expect(row).toContainText("キャンセル（通信トラブル等）");

      const { data } = await f.admin.from("com_t_session").select("status, cancel_category, ticket_consumed").eq("session_id", sessionId).single();
      expect(data).toMatchObject({ status: 3, cancel_category: 6, ticket_consumed: false });
      expect(await usedSessions()).toBe(0);
    });
  } finally {
    await context.close();
  }
});
