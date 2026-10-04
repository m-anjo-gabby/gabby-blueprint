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
 * 発話の流れ（仕様: e2e/specs/training/speaking-flow.md）
 * - 単語帳: 発話ボタン → チャイム → 認識 → 評価（表示中のフレーズ）。停止でその時点の評価で確定
 * - スプリント: 問題種別ごとの再生順（Speed: 質問文 / Builders・Structure: 基本文→指示文 / Mastery: 基本文→質問文）
 *   → 発話評価。発話評価OFFでは発話しない。ドリルは発話ボタンで発話する
 * - 結果画面: スプリントの終了後は「全て再生」が自動で始まる。文の個別再生では問題ごとの再生ボタンが「再生中」にならない
 * - 中断と復旧: 発話中に画面が隠れると発話を止め、戻ると同じ問題を頭からやり直す（表示・非表示は擬似的に切り替える。
 *   iOS 固有の中断（AudioContext が running のまま無音になる等）は再現できないため実機で確認する）
 *
 * 実際のマイク・音声認識は使えないため、アプリのテスト用の認識方式（packages/lib/audio/core/recognizer/fake.ts）を使う。
 * fake は本番以外のビルドで window.__gabbyFakeSpeech を設定したときだけ使われるため、dev でのみ実行する
 * （ステージングは本番ビルドのためスキップ）。認識精度・実際の音声は対象外（CONVENTIONS.md 2章）。
 * 再生した音声（音声ファイルの取得）と発話評価の開始（参照文）を、ブラウザ内の記録に順番に残して確かめる。
 */

const PASSWORD = "Speaking2026a";

interface SpeechLogEntry {
  type: "audio" | "listen";
  text?: string;
}

interface FakeSpeechConfig {
  transcript?: string;
  delayMs?: number;
}

type FakeSpeechWindow = Window & { __gabbyFakeSpeech?: FakeSpeechConfig & { log: SpeechLogEntry[] } };

test.use({
  storageState: { cookies: [], origins: [] },
  // 偽のマイクを使い、音声の自動再生を許可する（ブラウザの起動設定のためファイル単位で指定する）
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
  // マイクの許可確認（getUserMedia）を通すため、マイクの使用を許可しておく
  permissions: ["microphone"],
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

/**
 * 以降に開くページで、テスト用の認識方式を使わせる（transcript 未指定なら参照文をそのまま返す＝満点）。
 * 音声ファイルの取得（＝再生）と発話評価の開始を、起きた順に window.__gabbyFakeSpeech.log へ記録する。
 */
async function useFakeSpeech(page: Page, config: FakeSpeechConfig = {}): Promise<void> {
  await page.addInitScript((c) => {
    const log: SpeechLogEntry[] = [];
    (window as FakeSpeechWindow).__gabbyFakeSpeech = { ...c, log };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/storage/v1/object/public/")) log.push({ type: "audio", text: decodeURIComponent(url) });
      return originalFetch(input, init);
    };
  }, config);
}

const readSpeechLog = (page: Page): Promise<SpeechLogEntry[]> =>
  page.evaluate(() => (window as FakeSpeechWindow).__gabbyFakeSpeech?.log ?? []);

/** 最初の発話評価が始まるまで待ち、それまでの記録を返す（最後の要素が発話評価の開始） */
async function waitForFirstListen(page: Page): Promise<SpeechLogEntry[]> {
  await expect
    .poll(async () => (await readSpeechLog(page)).some((e) => e.type === "listen"), { timeout: 60_000 })
    .toBe(true);
  const log = await readSpeechLog(page);
  return log.slice(0, log.findIndex((e) => e.type === "listen") + 1);
}

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

  test("発話ボタンを押すと、表示中のフレーズをチャイムの後に発話評価し、評価が表示される", async ({ page }) => {
    test.setTimeout(120_000);
    await useFakeSpeech(page);
    await openWordDrill(page);

    await page.getByRole("button", { name: "発話練習" }).click();

    // 参照文どおりの発話（fake の既定）なので最高評価になる
    await expect(page.getByText("SCORE", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Excellent", { exact: true })).toBeVisible();

    // 発話評価は1回だけ、表示中のフレーズ（画面に出ている英文）を参照文にして行われる
    const listen = (await readSpeechLog(page)).filter((e) => e.type === "listen");
    expect(listen).toHaveLength(1);
    expect(listen[0].text).toBeTruthy();
    await expect(page.getByText(listen[0].text!, { exact: false }).first()).toBeAttached();
  });

  test("発話中に止めると、その時点の評価で確定する", async ({ page }) => {
    test.setTimeout(120_000);
    // 認識結果が届く前に止められるよう、文字起こしを返すまでの時間を長くする
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
  type QuestionType = "0" | "4" | "5" | "6";

  interface SprintQuestionRow {
    question_type: QuestionType;
    statement_voice: string | null;
    question_voice: string | null;
    answer_sentence_yes_en: string;
  }

  const QUESTION_TYPES: QuestionType[] = ["0", "4", "5", "6"];

  /**
   * 4種別すべてに音声付きの問題がある教材を、使い捨ての顧客に公開して返す。
   * 公開範囲の違う環境でも動くよう、名前ではなく問題の有無で選ぶ。
   */
  async function prepareSprintContent(f: AuthFixture): Promise<{ contentId: string; sprintType: string; questions: SprintQuestionRow[] }> {
    const { data: mastery, error } = await f.admin
      .from("com_m_sprint_questions")
      .select("content_id")
      .eq("question_type", "6")
      .not("question_voice", "is", null)
      .not("statement_voice", "is", null);
    if (error) throw new Error(`スプリントの問題の取得に失敗しました: ${error.message}`);

    for (const contentId of [...new Set((mastery ?? []).map((r) => r.content_id as string))]) {
      const { data: questions } = await f.admin
        .from("com_m_sprint_questions")
        .select("question_type, statement_voice, question_voice, answer_sentence_yes_en")
        .eq("content_id", contentId)
        .not("question_voice", "is", null);
      const rows = (questions ?? []) as SprintQuestionRow[];
      if (!QUESTION_TYPES.every((t) => rows.some((q) => q.question_type === t))) continue;

      const { data: content } = await f.admin
        .from("com_m_contents")
        .select("content_scope, metadata")
        .eq("content_id", contentId)
        .eq("delete_flg", "0")
        .maybeSingle();
      if (!content) continue;
      if (content.content_scope === 1) {
        const { error: accessError } = await f.admin.from("com_m_contents_access").insert({ client_id: f.clientId, content_id: contentId });
        if (accessError) throw new Error(`スプリントの公開先の追加に失敗しました: ${accessError.message}`);
      }
      const sprintType = (content.metadata as { sprint?: { sprint_type?: string } } | null)?.sprint?.sprint_type ?? "0";
      return { contentId, sprintType, questions: rows };
    }
    throw new Error("4種別すべてに音声付きの問題があるスプリント教材が見つかりません");
  }

  /** スプリント選択画面を開き、発話評価の有無を選ぶ（ONの場合はマイクを許可する） */
  async function openSprintSelect(
    page: Page,
    params: { mode: "sprint" | "drill"; type: QuestionType; contentId: string; sprintType: string; assessment: boolean },
  ): Promise<void> {
    await page.goto(`/training/sprint/play?mode=${params.mode}&type=${params.type}&content_id=${params.contentId}&sprint_type=${params.sprintType}`);
    const assessmentOff = page.getByRole("button", { name: "OFF", exact: true });
    await expect(assessmentOff).toBeVisible({ timeout: 30_000 });
    if (!params.assessment) {
      await assessmentOff.click();
      return;
    }
    const allowMic = page.getByRole("button", { name: "タップしてマイクを許可する" });
    if (await allowMic.isVisible()) await allowMic.click();
  }

  /** 記録された音声のURLが、その問題のどの音声か */
  const isAudioOf = (entry: SpeechLogEntry | undefined, path: string | null): boolean =>
    entry?.type === "audio" && !!path && !!entry.text?.endsWith(path);

  const PROMPT_ORDER: Record<QuestionType, { label: string; withStatement: boolean }> = {
    "0": { label: "Speed: 質問文 → 発話", withStatement: false },
    "5": { label: "Builders: 基本文 → 指示文 → 発話", withStatement: true },
    "4": { label: "Structure: 基本文 → 指示文 → 発話", withStatement: true },
    "6": { label: "Mastery: 基本文 → 質問文 → 発話", withStatement: true },
  };

  for (const type of ["0", "5", "4", "6"] as const) {
    const { label, withStatement } = PROMPT_ORDER[type];

    test(`スプリント（${label}）: 再生の後にチャイムが鳴り、解答文で発話評価される`, async ({ page }) => {
      test.setTimeout(150_000);
      await useFakeSpeech(page);
      const f = await startAsStudent(page);
      const sprint = await prepareSprintContent(f);

      await openSprintSelect(page, { mode: "sprint", type, contentId: sprint.contentId, sprintType: sprint.sprintType, assessment: true });
      // Speed は回答の種類（YES/NO）を選んで開始する。YES で開始し、YES の解答文で評価されることを確かめる
      const start = page.getByRole("button", { name: type === "0" ? "YESで回答開始" : "スプリントを開始" });
      await expect(start).toBeEnabled();
      await start.click();

      const log = await waitForFirstListen(page);
      const listen = log[log.length - 1];
      const question = sprint.questions.find((q) => q.question_type === type && q.answer_sentence_yes_en === listen.text);
      expect(question, `発話評価の参照文が ${label} の問題の解答文ではない: ${listen.text}`).toBeTruthy();

      // 発話評価の直前に再生された音声の並び（同じ問題の 基本文 → 質問文/指示文、または 質問文のみ）
      const played = log.slice(0, -1).filter((e) => e.type === "audio");
      if (withStatement) {
        expect(isAudioOf(played.at(-2), question!.statement_voice), "基本文が再生されていない").toBe(true);
        expect(isAudioOf(played.at(-1), question!.question_voice), "基本文の後に質問文/指示文が再生されていない").toBe(true);
      } else {
        expect(isAudioOf(played.at(-1), question!.question_voice), "質問文が再生されていない").toBe(true);
        expect(played.some((e) => isAudioOf(e, question!.statement_voice)), "Speed で基本文が再生された").toBe(false);
      }

      await expect(page.getByText("Excellent", { exact: true })).toBeVisible({ timeout: 20_000 });
    });
  }

  test("スプリント（発話評価OFF）: 問題を再生した後は発話せず、脳内回答で次の問題へ進める", async ({ page }) => {
    test.setTimeout(150_000);
    await useFakeSpeech(page);
    const f = await startAsStudent(page);
    const sprint = await prepareSprintContent(f);

    await openSprintSelect(page, { mode: "sprint", type: "6", contentId: sprint.contentId, sprintType: sprint.sprintType, assessment: false });
    await page.getByRole("button", { name: "スプリントを開始" }).click();

    await expect(page.getByText("発話なし", { exact: true })).toBeVisible({ timeout: 30_000 });
    // 回答の段階（基本文・質問文の再生後）になると「次の問題へ」が押せるようになる
    await expect(page.getByRole("button", { name: "次の問題へ" })).toBeEnabled({ timeout: 60_000 });

    const log = await readSpeechLog(page);
    expect(log.filter((e) => e.type === "audio").length).toBeGreaterThanOrEqual(2);
    expect(log.some((e) => e.type === "listen")).toBe(false);
  });

  test("スプリント: 発話中に画面が隠れると発話を止め、戻ると同じ問題を頭からやり直す", async ({ page }) => {
    test.setTimeout(150_000);
    // 発話中に画面を隠せるよう、文字起こしを返すまでの時間を長くする
    await useFakeSpeech(page, { delayMs: 60_000 });
    const f = await startAsStudent(page);
    const sprint = await prepareSprintContent(f);

    await openSprintSelect(page, { mode: "sprint", type: "6", contentId: sprint.contentId, sprintType: sprint.sprintType, assessment: true });
    await page.getByRole("button", { name: "スプリントを開始" }).click();
    const first = await waitForFirstListen(page);
    const listenText = first[first.length - 1].text;

    // 画面の表示・非表示（iOS ではバックグラウンド・画面ロック）を擬似的に切り替える
    const setVisibility = (state: "hidden" | "visible") =>
      page.evaluate((v) => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);

    await setVisibility("hidden");
    await setVisibility("visible");

    // 戻ると、次の問題へ進まずに同じ問題を頭から再生し直し、同じ解答文でもう一度発話評価が始まる
    await expect
      .poll(async () => (await readSpeechLog(page)).filter((e) => e.type === "listen").map((e) => e.text), { timeout: 60_000 })
      .toEqual([listenText, listenText]);
  });

  test("スプリントの終了後、結果画面で「全て再生」が自動で始まり、文の個別再生では問題の再生ボタンが再生中にならない", async ({ page }) => {
    test.setTimeout(180_000);
    await useFakeSpeech(page);
    const f = await startAsStudent(page);
    const sprint = await prepareSprintContent(f);

    // 全問に発話で答え終えると、スプリントが終わって結果画面へ移る
    await openSprintSelect(page, { mode: "sprint", type: "6", contentId: sprint.contentId, sprintType: sprint.sprintType, assessment: true });
    await page.getByRole("button", { name: "スプリントを開始" }).click();
    await page.waitForURL(/\/training\/sprint\/result\/[0-9a-f-]{36}/, { timeout: 150_000 });

    await test.step("「全て再生」が自動で始まり、自動再生の指定はURLから外れる", async () => {
      await expect(page.getByRole("button", { name: "停止", exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL(/\/training\/sprint\/result\/[0-9a-f-]{36}$/);
      await page.getByRole("button", { name: "停止", exact: true }).click();
    });

    await test.step("文を1つだけ再生しても、問題ごとの再生ボタンは「再生中」にならない", async () => {
      const card = page.locator('[id^="card-"]').first();
      await card.getByRole("button", { name: "解答文を再生" }).first().click();
      await expect(card.getByRole("button", { name: "再生", exact: true })).toBeVisible();
      await expect(card.getByText("再生中", { exact: true })).toHaveCount(0);
    });
  });

  test("ドリル: 問題の再生後、発話ボタンを押すとチャイムの後に解答文で発話評価され、評価が表示される", async ({ page }) => {
    test.setTimeout(150_000);
    await useFakeSpeech(page);
    const f = await startAsStudent(page);
    const sprint = await prepareSprintContent(f);

    await openSprintSelect(page, { mode: "drill", type: "6", contentId: sprint.contentId, sprintType: sprint.sprintType, assessment: true });
    await page.getByRole("button", { name: "ドリルを開始" }).click();

    // ドリルは問題（基本文 → 質問文）を自動で再生した後、発話ボタンを押すまで発話しない
    await expect
      .poll(async () => (await readSpeechLog(page)).filter((e) => e.type === "audio").length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(2);
    const record = page.getByRole("button", { name: "発話練習" });
    await expect(record).toBeEnabled({ timeout: 30_000 });
    expect((await readSpeechLog(page)).some((e) => e.type === "listen")).toBe(false);

    await record.click();
    const log = await waitForFirstListen(page);
    const listen = log[log.length - 1];
    const firstStatement = log.find((e) => e.type === "audio");
    const question = sprint.questions.find((q) => q.question_type === "6" && isAudioOf(firstStatement, q.statement_voice));
    expect(question, "最初に再生された基本文の問題が見つからない").toBeTruthy();
    expect(listen.text).toBe(question!.answer_sentence_yes_en);

    await expect(page.getByText("SCORE", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Excellent", { exact: true })).toBeVisible();
  });
});
