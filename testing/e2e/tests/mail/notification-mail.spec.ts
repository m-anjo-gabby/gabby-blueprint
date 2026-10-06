import { expect, request, test } from "@playwright/test";
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { cronSecret, invokeMailDispatch } from "../../support/mailDispatch.ts";
import { getPersonaPassword, storageStatePath } from "../../support/personas.ts";
import { extractAppLinkPath, resendReadApiKey, resendTestAddress, waitForEmail } from "../../support/resendInbox.ts";
import { STUDENT_BASE_URL } from "../../support/targets.ts";

/**
 * 出来事の通知メール（testing/e2e/specs/notification/mail-dispatch.md）。
 * アプリ内通知（com_t_notification）の登録をきっかけに送信待ちへ積まれることを、通知を直接登録して確かめる
 * （予約・キャンセル等の RPC は通知を登録するだけで、メールの扱いは共通のトリガーが受け持つため）。
 * 送信は pg_cron・pg_net の代わりに送信処理（admin の /api/cron/mail-dispatch）を呼ぶ。
 * 使い捨ての顧客・生徒で行い、テストの最後に削除する（通知・送信待ち・配信設定はユーザーの削除で消える）。
 */

test.describe.configure({ mode: "serial" });

let fixture: AuthFixture | undefined;

test.afterAll(async () => {
  await cleanupAuthFixture(fixture);
});

async function insertNotification(
  f: AuthFixture,
  userId: string,
  values: { notification_type: string; payload?: Record<string, unknown>; link_path?: string; dedup_key?: string }
): Promise<string> {
  const { data, error } = await f.admin
    .from("com_t_notification")
    .insert({ user_id: userId, payload: {}, ...values })
    .select("notification_id")
    .single();
  if (error || !data) throw new Error(`通知の登録に失敗: ${error?.message}`);
  return data.notification_id as string;
}

async function outboxRows(f: AuthFixture, userId: string) {
  const { data, error } = await f.admin
    .from("com_t_mail_outbox")
    .select("mail_type, dedup_key, status, last_error, scheduled_at")
    .eq("user_id", userId)
    .order("insert_date");
  if (error) throw new Error(error.message);
  return data ?? [];
}

test("通知の登録ですぐ送るメールが積まれ、送信処理で届く。達成の通知・配信停止の人には送らない", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "メール送信は desktop のみ");
  test.skip(!resendReadApiKey() || !cronSecret(), "RESEND_TEST_READ_API_KEY または CRON_SECRET が未設定");

  fixture = await createAuthFixture("mail");
  const password = getPersonaPassword();
  const emailA = resendTestAddress(`${fixture.tag}-notify`);
  const studentA = await createDisposableStudent(fixture, { email: emailA, password, userName: "E2E通知" });
  const studentB = await createDisposableStudent(fixture, { email: resendTestAddress(`${fixture.tag}-optout`), password });
  const { error: settingErr } = await fixture.admin
    .from("com_t_user_mail_setting")
    .insert({ user_id: studentB, category: "NOTIFICATION", enabled: false });
  if (settingErr) throw new Error(settingErr.message);

  const approvedId = await insertNotification(fixture, studentA, {
    notification_type: "SESSION_BOOKING_APPROVED",
    payload: { coach_name: "E2Eコーチ" },
    link_path: "/live-room",
  });
  // 達成の通知はメールにしない
  await insertNotification(fixture, studentA, { notification_type: "TRAINING_FIRST" });
  await insertNotification(fixture, studentB, { notification_type: "SESSION_BOOKING_APPROVED", payload: { coach_name: "E2Eコーチ" } });

  expect((await outboxRows(fixture, studentA)).map((r) => [r.mail_type, r.dedup_key, r.status])).toEqual([
    ["NOTIFICATION", approvedId, "PENDING"],
  ]);

  const since = new Date();
  expect((await invokeMailDispatch()).status()).toBe(200);
  expect((await outboxRows(fixture, studentA)).map((r) => r.status)).toEqual(["SENT"]);
  expect((await outboxRows(fixture, studentB)).map((r) => [r.status, r.last_error])).toEqual([["SKIPPED", "opted_out"]]);

  const mail = await waitForEmail({ to: emailA, since });
  expect(mail.subject).toBe("【Gabby Blueprint】予約が承認されました");
  expect(mail.html).toContain("E2Eコーチがセッションの予約を承認しました。");
  expect(mail.html).toContain("/live-room");
  // ロゴは公開 URL の画像、テキスト版も同じ内容で送る
  expect(mail.html).toMatch(/<img src="https:\/\/[^"]+\/mail-logo\.png"/);
  expect(mail.text).toContain("E2Eコーチがセッションの予約を承認しました。");
  expect(mail.text).toContain("▼ アプリで確認する");

  // ログイン不要の配信停止: 確認画面（GET）では停止せず、ボタン（POST）で「通知」の区分を停止する
  const unsubscribePath = extractAppLinkPath(mail.html ?? "", "/mail/unsubscribe");
  expect(mail.text).toContain("/mail/unsubscribe?");
  const portal = await request.newContext({ baseURL: STUDENT_BASE_URL, ignoreHTTPSErrors: true });
  try {
    const confirm = await portal.get(unsubscribePath);
    expect(confirm.status()).toBe(200);
    expect(await confirm.text()).toContain("「通知」のメールの配信を停止します。");
    const settingRows = async () =>
      (await fixture!.admin.from("com_t_user_mail_setting").select("category, enabled").eq("user_id", studentA)).data ?? [];
    expect(await settingRows()).toEqual([]);

    const tampered = await portal.post(unsubscribePath.replace(/t=[^&]+/, "t=invalid"), { form: { "List-Unsubscribe": "One-Click" } });
    expect(tampered.status()).toBe(400);
    expect(await settingRows()).toEqual([]);

    const done = await portal.post(unsubscribePath, { form: { "List-Unsubscribe": "One-Click" } });
    expect(done.status()).toBe(200);
    expect(await done.text()).toContain("「通知」のメールの配信を停止しました。");
    expect(await settingRows()).toEqual([{ category: "NOTIFICATION", enabled: false }]);
    // 次のテスト（チャットの新着）は同じ生徒に送るため、配信を元に戻す
    await fixture!.admin.from("com_t_user_mail_setting").delete().eq("user_id", studentA);
  } finally {
    await portal.dispose();
  }
});

test("チャットの新着は未読が10分続いたら1通。未読のままの続きはまとめ、既読後の新着は新しい1通", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てのユーザーを作るため desktop のみ");
  test.skip(!fixture, "前のテストで使い捨てのユーザーを作れなかった");
  const f = fixture!;
  const studentId = f.userIds[0];
  const roomKey = `e2e-room-${f.tag}`;

  const chatId = await insertNotification(f, studentId, {
    notification_type: "CHAT_NEW_MESSAGE",
    dedup_key: roomKey,
    payload: { sender_name: "E2Eコーチ", preview: "Hello" },
    link_path: `/chat/${roomKey}`,
  });
  const chatRows = async () => (await outboxRows(f, studentId)).filter((r) => r.mail_type === "CHAT_UNREAD");

  const [first] = await chatRows();
  expect(first.status).toBe("PENDING");
  // 送る時刻は10分後（送信処理を呼んでもまだ送らない）
  expect(new Date(first.scheduled_at).getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);
  expect((await invokeMailDispatch()).status()).toBe(200);
  expect((await chatRows()).map((r) => r.status)).toEqual(["PENDING"]);

  // 未読のまま続いた発言（同じ通知の更新）は、同じ1通にまとめる
  await f.admin
    .from("com_t_notification")
    .update({ payload: { sender_name: "E2Eコーチ", preview: "Are you there?" }, occurred_at: new Date().toISOString() })
    .eq("notification_id", chatId);
  expect(await chatRows()).toHaveLength(1);

  // 既読になった後の新着は、新しい1通
  await f.admin.from("com_t_notification").update({ is_read: true, read_at: new Date().toISOString() }).eq("notification_id", chatId);
  await f.admin
    .from("com_t_notification")
    .update({ is_read: false, read_at: null, occurred_at: new Date(Date.now() + 1000).toISOString() })
    .eq("notification_id", chatId);
  expect(await chatRows()).toHaveLength(2);
});

test.describe("メール通知の設定", () => {
  test.use({ storageState: storageStatePath("monitorStudent") });

  test("プロフィールに「通知」と「リマインダー」の切り替えが出る（閲覧のみ）", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("switch", { name: "通知" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "リマインダー" })).toBeVisible();
  });
});
