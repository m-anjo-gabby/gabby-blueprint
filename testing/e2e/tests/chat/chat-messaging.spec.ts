import type { Page } from "@playwright/test";
import { test, expect, mainNav, navTab } from "../../support/studentApp.ts";
import { PERSONAS, getPersonaPassword, storageStatePath } from "../../support/personas.ts";
import {
  cleanupChatFixture,
  createChatFixture,
  markReadAsCoach,
  sendAsCoach,
  type ChatE2EFixture,
} from "../../support/chatFixtures.ts";
import { watchRealtime } from "../../support/realtime.ts";

/**
 * チャット（生徒アプリ）の2ペイン・既読・下書き・添付・直接リンクの回帰テスト。
 * 仕様: testing/e2e/specs/chat/chat-messaging.md、画面: docs/screens/student/chat/{list,room}.md
 * テストごとに使い捨てのルームを作り、終わったら削除する（support/chatFixtures.ts）。
 */

test.use({ storageState: storageStatePath("liveStudent") });

let fixture: ChatE2EFixture;

test.beforeEach(async () => {
  fixture = await createChatFixture();
});

test.afterEach(async () => {
  await cleanupChatFixture(fixture);
});

const roomPath = (roomId: string) => `/chat/${roomId}`;
const roomRow = (page: Page, roomId: string) => page.locator(`main a[href="${roomPath(roomId)}"]`);
const composer = (page: Page) => page.locator("main textarea");
/** 入力欄に入力する（ハイドレーション前に入力すると内容が消えるため、入力できる状態になるのを待つ） */
async function typeMessage(page: Page, text: string): Promise<void> {
  await expect(composer(page)).toHaveAttribute("data-ready", "true");
  await composer(page).fill(text);
}
/** タイムラインのメッセージ1件（本文で特定する） */
const messageItem = (page: Page, text: string) => page.locator("main section div.group").filter({ hasText: text });

/** 1x1 の PNG（貼り付け・ドロップ用） */
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("一覧: 未読の絞り込みと検索でルームを絞り込める", async ({ page }) => {
  await page.goto("/chat");
  await expect(roomRow(page, fixture.oneOnOneRoomId)).toBeVisible();

  await page.getByRole("tab", { name: /未読/ }).click();
  await expect(roomRow(page, fixture.oneOnOneRoomId)).toBeVisible();
  // 未読の無いグループは消える
  await expect(roomRow(page, fixture.groupRoomId)).toBeHidden();

  await page.getByRole("tab", { name: "すべて" }).click();
  await page.getByRole("searchbox", { name: "名前・メッセージを検索" }).fill(fixture.groupRoomName);
  await expect(roomRow(page, fixture.groupRoomId)).toBeVisible();
  await expect(roomRow(page, fixture.oneOnOneRoomId)).toBeHidden();
});

test("直接開く: 未読の区切り線が出て、自分と相手の発言が左右に分かれる", async ({ page }, testInfo) => {
  await page.goto(roomPath(fixture.oneOnOneRoomId));
  await expect(page.getByText("ここから未読")).toBeVisible();

  // 区切り線は最初の未読（2件目）の直前
  const divider = await page.getByText("ここから未読").boundingBox();
  const secondMessage = await messageItem(page, fixture.coachMessages[1]).boundingBox();
  expect(divider!.y).toBeLessThan(secondMessage!.y);

  await typeMessage(page, "E2E student reply");
  await page.getByRole("button", { name: "送信" }).click();
  // 一覧のプレビューにも同じ文言が出るため、タイムラインの吹き出しに限定して左右を比べる（右端の位置で比較）
  const mine = messageItem(page, "E2E student reply").getByText("E2E student reply", { exact: true });
  await expect(mine).toBeVisible();
  const theirs = messageItem(page, fixture.coachMessages[2]).getByText(fixture.coachMessages[2], { exact: true });
  const rightEdge = async (l: typeof mine) => {
    const box = (await l.boundingBox())!;
    return box.x + box.width;
  };
  expect(await rightEdge(mine)).toBeGreaterThan(await rightEdge(theirs));

  if (testInfo.project.name.startsWith("mobile")) {
    // スマートフォンではルームを開いている間ナビを隠す
    await expect(mainNav(page)).toBeHidden();
    await page.getByRole("link", { name: "チャット一覧に戻る" }).click();
    await expect(roomRow(page, fixture.oneOnOneRoomId)).toBeVisible();
  } else {
    // PCは2ペインのまま一覧も表示している
    await expect(roomRow(page, fixture.groupRoomId)).toBeVisible();
  }
});

test("既読: コーチが読むと、自分の最新の発言の下に「既読」がリアルタイムで出る", async ({ page }) => {
  await page.goto(roomPath(fixture.oneOnOneRoomId));
  await typeMessage(page, "E2E read receipt");
  await page.getByRole("button", { name: "送信" }).click();
  const mine = messageItem(page, "E2E read receipt");
  await expect(mine).toBeVisible();
  await expect(mine.getByText("既読", { exact: true })).toBeHidden();

  await markReadAsCoach(fixture, fixture.oneOnOneRoomId);
  await expect(mine.getByText("既読", { exact: true })).toBeVisible();
  // 表示は常に1か所だけ
  await expect(page.getByText("既読", { exact: true })).toHaveCount(1);
});

test("下書き: 別のルームへ移って戻っても入力中の内容が残る", async ({ page }, testInfo) => {
  await page.goto(roomPath(fixture.oneOnOneRoomId));
  await typeMessage(page, "E2E draft");

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("link", { name: "チャット一覧に戻る" }).click();
  }
  await roomRow(page, fixture.groupRoomId).click();
  await expect(page).toHaveURL(new RegExp(roomPath(fixture.groupRoomId)));
  await expect(composer(page)).toHaveValue("");

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("link", { name: "チャット一覧に戻る" }).click();
  }
  await roomRow(page, fixture.oneOnOneRoomId).click();
  await expect(composer(page)).toHaveValue("E2E draft");
});

test.describe("画像の添付（PCのみ）", () => {
  // 貼り付け・ドロップのイベント合成は Chromium の DataTransfer に依存するため PC（Chromium）で確認する
  test.skip(({ browserName }) => browserName !== "chromium");

  test("貼り付けた画像は即送信されず、送信後は拡大表示できる", async ({ page }) => {
    await page.goto(roomPath(fixture.oneOnOneRoomId));
    await expect(composer(page)).toBeVisible();

    await composer(page).evaluate((el, base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "image.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, PNG_BASE64);

    // 送信前の添付として並ぶ（貼り付け画像は日時入りの名前に付け替わる）。まだ送信されていない
    const pending = page.getByText(/^pasted-image-\d{8}-\d{6}\.png$/);
    await expect(pending).toBeVisible();
    await expect(page.getByRole("button", { name: "画像を拡大表示" })).toHaveCount(0);

    await page.getByRole("button", { name: "送信" }).click();
    await expect(pending).toBeHidden();
    const thumbnail = page.getByRole("button", { name: "画像を拡大表示" });
    await expect(thumbnail).toBeVisible();

    await thumbnail.click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.getByRole("link", { name: "元の画像を開く" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
  });

  test("タイムラインにドロップしたファイルは送信前の添付に加わる", async ({ page }) => {
    await page.goto(roomPath(fixture.oneOnOneRoomId));
    const timeline = page.locator("main section").first();
    await expect(composer(page)).toBeVisible();

    const dataTransfer = await page.evaluateHandle((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
      return dt;
    }, PNG_BASE64);

    await timeline.dispatchEvent("dragenter", { dataTransfer });
    await expect(page.getByText("ここにドロップして添付")).toBeVisible();
    await timeline.dispatchEvent("drop", { dataTransfer });
    await expect(page.getByText("ここにドロップして添付")).toBeHidden();
    await expect(page.getByText("dropped.png")).toBeVisible();
    await expect(page.getByRole("button", { name: "画像を拡大表示" })).toHaveCount(0);
  });
});

test("ナビの未読バッジ: チャット画面以外でも新着でリアルタイムに増える", async ({ page }) => {
  const realtime = watchRealtime(page);
  await page.goto("/dashboard");
  const chatTab = navTab(page, /チャット/);
  await expect(chatTab).toBeVisible();

  const unreadCount = async () => Number((await chatTab.textContent())?.match(/\d+/)?.[0] ?? 0);
  // 初期表示の未読数の反映を待つ（使い捨てルームに未読が2件あるため1以上。未読数はサーバーで取得して最初から表示される）
  await expect.poll(unreadCount).toBeGreaterThan(0);
  const before = await unreadCount();
  // 未読数が表示されても Realtime の購読は完了していないことがあるため、新着を送る前に購読の完了を待つ
  // （ナビの未読は通知の購読に相乗りして取り直す。useNotificationRealtime）
  await realtime.waitForSubscribed("notification_");

  await sendAsCoach(fixture, fixture.oneOnOneRoomId, "E2E realtime badge");
  await expect.poll(unreadCount).toBe(before + 1);
});

test("開けないルーム: 画面全体の404ではなく、ペインに案内が出る", async ({ page }) => {
  await page.goto("/chat/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("このチャットは表示できません")).toBeVisible();
  await expect(page.getByRole("link", { name: "チャット一覧に戻る" }).last()).toBeVisible();
});

test.describe("未ログインで開いたリンク", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("ログイン後に開こうとしたルームへ戻る", async ({ page }) => {
    await page.goto(roomPath(fixture.oneOnOneRoomId));
    await expect(page).toHaveURL(/\/login\?next=/);

    await page.locator("input[name=email]").fill(PERSONAS.liveStudent.email);
    await page.locator("input[name=password]").fill(getPersonaPassword());
    await page.locator("input[name=password]").press("Enter");
    await expect(page).toHaveURL(new RegExp(`${roomPath(fixture.oneOnOneRoomId)}$`));
    await expect(page.getByText(fixture.coachMessages[2])).toBeVisible();
  });
});
