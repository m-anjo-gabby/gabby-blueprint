import type { Page } from "@playwright/test";
import { test, expect, loginAsNewStudent } from "../../support/studentApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  grantAppLicense,
  prepareWordContent,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { USES_LOCAL_SERVER } from "../../support/targets.ts";

/**
 * 発話の流れ: 単語帳（発話ボタン → チャイム → 認識 → 評価）と、スプリント（問題の再生 → チャイム → 認識 → 評価）を通す。
 *
 * 実際のマイク・音声認識は使えないため、アプリのテスト用の認識方式（packages/lib/audio/core/recognizer/fake.ts）を使う。
 * fake は本番以外のビルドで window.__gabbyFakeSpeech を設定したときだけ使われるため、dev でのみ実行する
 * （ステージングは本番ビルドのためスキップ）。認識精度・実際の音声は対象外（CONVENTIONS.md 2章）。
 */

const PASSWORD = "Speaking2026a";

interface FakeSpeechConfig {
  transcript?: string;
  delayMs?: number;
}

/** 以降に開くページで、テスト用の認識方式を使わせる（transcript 未指定なら参照文をそのまま返す＝満点） */
async function useFakeSpeech(page: Page, config: FakeSpeechConfig = {}): Promise<void> {
  await page.addInitScript((c) => {
    (window as unknown as { __gabbyFakeSpeech?: FakeSpeechConfig }).__gabbyFakeSpeech = c;
  }, config);
}

test.use({
  storageState: { cookies: [], origins: [] },
  // 偽のマイクを使い、音声の自動再生を許可する（ブラウザの起動設定のためファイル単位で指定する）
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
});

let fixture: AuthFixture | undefined;

test.afterEach(async () => {
  if (fixture) {
    await fixture.admin.from("com_m_contents_access").delete().eq("client_id", fixture.clientId);
  }
  // 単語帳の進捗・スプリントの記録は生徒の削除で連鎖削除される
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  test.skip(!USES_LOCAL_SERVER, "テスト用の認識方式は本番ビルドでは使えないため dev だけで実行する");
});

/** 使い捨てのアプリのみ契約の生徒を作ってログインする */
async function startAsStudent(page: Page): Promise<AuthFixture> {
  const f = await createAuthFixture("speak");
  fixture = f;
  const email = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const userId = await createDisposableStudent(f, { email, password: PASSWORD });
  await grantAppLicense(f, userId);
  await loginAsNewStudent(page, email, PASSWORD);
  return f;
}

test.describe("単語帳の発話", () => {
  /** 使い捨ての生徒で単語帳を開く */
  async function openWordDrill(page: Page): Promise<void> {
    const f = await startAsStudent(page);
    const word = await prepareWordContent(f);
    await page.goto(`/training/word/${word.content_id}`);
    await expect(page.getByRole("button", { name: "発話練習" })).toBeEnabled({ timeout: 30_000 });
  }

  test("発話ボタンを押すと、チャイムの後に認識が始まり、評価が表示される", async ({ page }) => {
    test.setTimeout(120_000);
    await useFakeSpeech(page);
    await openWordDrill(page);

    await page.getByRole("button", { name: "発話練習" }).click();

    // 参照文どおりの発話（fake の既定）なので最高評価になる
    await expect(page.getByText("SCORE", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Excellent", { exact: true })).toBeVisible();
  });

  test("発話中に止めると、その時点の評価で確定する", async ({ page }) => {
    test.setTimeout(120_000);
    // 認識結果が届く前に Stop を押せるよう、文字起こしを返すまでの時間を長くする
    await useFakeSpeech(page, { delayMs: 60_000 });
    await openWordDrill(page);

    await page.getByRole("button", { name: "発話練習" }).click();
    const stop = page.getByRole("button", { name: "発話を止める" });
    await expect(stop).toBeVisible({ timeout: 20_000 });
    await stop.click();

    // 何も聞き取れていない時点で確定するため、評価は表示されるが最高評価にはならない
    await expect(page.getByText("SCORE", { exact: true })).toBeVisible();
    await expect(page.getByText("Excellent", { exact: true })).toHaveCount(0);
  });
});

test.describe("スプリントの発話", () => {
  // マイクの許可確認（getUserMedia）を通すため、マイクの使用を許可しておく
  test.use({ permissions: ["microphone"] });

  test("問題の音声が再生された後、チャイムの後に認識が始まり、評価が表示される", async ({ page }) => {
    test.setTimeout(150_000);
    await useFakeSpeech(page);
    const f = await startAsStudent(page);

    const { data: sprint, error } = await f.admin
      .from("com_m_contents")
      .select("content_id")
      .eq("content_type", 2)
      .eq("content_scope", 1)
      .eq("metadata->sprint->>sprint_type", "0")
      .limit(1)
      .single();
    if (error || !sprint) throw new Error(`汎用スプリントが見つかりません: ${error?.message}`);
    await f.admin.from("com_m_contents_access").insert({ client_id: f.clientId, content_id: sprint.content_id });

    await page.goto(`/training/sprint/play?mode=sprint&content_id=${sprint.content_id}&sprint_type=0`);

    const allowMic = page.getByRole("button", { name: "タップしてマイクを許可する" });
    const startYes = page.getByRole("button", { name: "YESで回答開始" });
    await expect(allowMic.or(startYes)).toBeVisible({ timeout: 30_000 });
    if (await allowMic.isVisible()) await allowMic.click();
    await expect(startYes).toBeEnabled();
    await startYes.click();

    // 問題の音声（実ファイル）の再生 → チャイム → 認識（参照文どおり）→ 最高評価
    await expect(page.getByText("Excellent", { exact: true })).toBeVisible({ timeout: 60_000 });
  });
});
