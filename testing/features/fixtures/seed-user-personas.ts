/**
 * testing/FIXTURES.md「利用者ペルソナ」を投入する冪等スクリプト。
 * 実際の利用者に近い量・ばらつきの学習履歴（単語帳・スプリント）・お気に入り・到達レベルを作る。
 * ライブ契約の生徒（P04・P05・P09）は、コーチ3名とのセッション履歴（分担・コーチ交代・キャンセルを含む）、
 * ダイアログ課題、チャットも作る（ライブまわりの処理は user-personas-live.ts）。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/fixtures/seed-user-personas.ts --env=dev
 *
 * 【冪等性】
 *   学習履歴は HISTORY_START（JST）から実行日の前日までを、ペルソナID×日付を種にした疑似乱数で作る。
 *   同じ日付には何度実行しても同じデータができるため、再実行すると「前回から昨日まで」の不足分が足され、
 *   日次サマリーは決まった値に戻る（手動操作でずれた値も戻る）。スプリントの実施記録は開始日時で重複を判定する。
 *   到達レベルは過去日付の履歴が無いときだけ作る（レベルの推移はトリガーが記録した履歴の日時を過去へ付け替える）。
 *   ライブのセッションは「スケジュール×開始日時」で重複を判定し、終了時刻を過ぎた回は再実行時に完了にする。
 *   チャットはメッセージが無いルームにだけ投入する。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTestEnv, resolveTestEnvFromArgs } from "../../helpers/env.ts";
import { createAdminClient } from "../../helpers/auth.ts";
import { currentTermIndex, termOf } from "../../helpers/fixture-terms.ts";
import { createFixtureKit, type ClientType } from "../../helpers/fixture-accounts.ts";
import { createChatKit, type ChatMessageSeed } from "../../helpers/fixture-chat.ts";
import { createLiveKit, type LiveCoach, type LiveScheduleSeed } from "./user-personas-live.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です（testing/.env.local を確認してください）。");
}

const admin: SupabaseClient = await createAdminClient();
const kit = createFixtureKit(admin, PASSWORD_ENV);
const live = createLiveKit(admin, PASSWORD_ENV);
const chat = createChatKit(admin);

/** 学習履歴の起点（JST）。「投入時点で3か月前から継続している」状態を作るための固定日 */
const HISTORY_START = "2026-07-01";
const ACCESS_NOTE = "【QA固定】利用者ペルソナ";

// ---------------------------------------------------------------------------
// 日付（すべてJSTの暦日 'YYYY-MM-DD' で扱う）
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3_600_000;
const dayMs = (d: string): number => Date.parse(`${d}T00:00:00Z`);
const addDays = (d: string, n: number): string => new Date(dayMs(d) + n * DAY_MS).toISOString().slice(0, 10);
const jstDateOf = (t: Date): string => new Date(t.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
/** JSTの暦日 d の hour 時（24以上は翌日） */
const jstAt = (d: string, hour: number): Date => new Date(dayMs(d) + hour * 3_600_000 - JST_OFFSET_MS);
/** 0=日曜 … 6=土曜 */
const dayOfWeek = (d: string): number => new Date(dayMs(d)).getUTCDay();
/** 月曜始まりの週番号（1970-01-01 は木曜） */
const weekIndex = (d: string): number => Math.floor((dayMs(d) / DAY_MS + 3) / 7);

const TODAY = jstDateOf(new Date());

// ---------------------------------------------------------------------------
// 疑似乱数（キーごとに決まった系列を返す）
// ---------------------------------------------------------------------------
type Rng = () => number;

function rngFor(key: string): Rng {
  let a = 2166136261;
  for (const ch of key) a = Math.imul(a ^ (ch.codePointAt(0) ?? 0), 16777619);
  a >>>= 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
/** 基準値に ±20% の揺らぎを付ける（最低1） */
const jitter = (rng: Rng, base: number): number => Math.max(1, Math.round(base * (0.8 + rng() * 0.4)));

// ---------------------------------------------------------------------------
// ペルソナ定義（testing/FIXTURES.md「利用者ペルソナ」と対応させる）
// ---------------------------------------------------------------------------
type TenantKey = "A" | "B" | "individual";
type QuestionType = "0" | "4" | "5" | "6";

interface Levels {
  speed: number;
  structure: number;
  builders: number;
  mastery: number;
}

type Schedule =
  | { kind: "daily" }
  /** 週1〜2日休む */
  | { kind: "rest1to2" }
  /** 決まった曜日だけ（0=日曜 … 6=土曜） */
  | { kind: "weekdays"; days: number[] }
  | { kind: "none" };

interface StudentPersona {
  id: string;
  seq: string;
  name: string;
  tenant: TenantKey;
  roles?: string[];
  schedule: Schedule;
  /** 学習した期間をここまでに限る（休眠ペルソナ用、JST・この日を含む） */
  activeUntil?: string;
  /** 1日の量の基準（単語・フレーズは延べ数、スプリントは実施回数） */
  daily: { words: number; phrases: number; sprints: number };
  /** 学習する時間帯（JSTの時。24以上は翌日） */
  slots: [number, number][];
  /** 1日に使う時間帯の数（省略時は全部） */
  slotsPerDay?: number;
  favorites: "none" | "few" | "many";
  /** 到達レベル（省略時は進捗行を作らない＝スプリント未経験） */
  levels?: Levels;
  /** レベルが上がった日（JST）と上がった後のレベル */
  levelUps?: { date: string; levels: Partial<Levels> }[];
  /** 発話評価の点数の中心 */
  scoreBase: number;
  /** ライセンスを当期の途中（初回投入日）から始める（新規ペルソナ用） */
  startsOnSeedDate?: boolean;
  /** ライブ契約（省略時はアプリのみ契約） */
  live?: LivePersona;
}

type CoachKey = "C1" | "C2" | "C3";
type LivePlanCode = "LIVE_WEEKLY1_3M" | "LIVE_WEEKLY2_3M";

interface CoachPersona {
  id: string;
  seq: string;
  name: string;
  timezone: string;
  /** 週次の対応可能時間帯（コーチのローカル時刻） */
  availability: { days: number[]; start: string; end: string }[];
}

interface LiveSlotPersona {
  slotNo: number;
  coach: CoachKey;
  /** コーチのローカル時刻基準（0=日曜 … 6=土曜） */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /** 担当した期間（コーチのローカル日付）。コーチ交代の前後で同じ枠を分ける */
  from?: string;
  until?: string;
}

interface LivePersona {
  plan: LivePlanCode;
  slots: LiveSlotPersona[];
  /** キャンセルした回（コーチのローカル日付） */
  cancellations?: { coach: CoachKey; date: string; by: "student" | "coach"; reason: string }[];
}

/** プランの1枠あたりのセッション数（3か月契約の total_sessions を週あたりの回数で割った数） */
const SESSIONS_PER_SLOT = 12;

const BEGINNER: Levels = { speed: 1, structure: 1, builders: 1, mastery: 1 };
const INTERMEDIATE: Levels = { speed: 4, structure: 3, builders: 2, mastery: 2 };
const ADVANCED: Levels = { speed: 7, structure: 6, builders: 4, mastery: 3 };

const COACHES: Record<CoachKey, CoachPersona> = {
  C1: {
    id: "COACH-01", seq: "01", name: "QAペルソナCOACH-01 Emily Carter（カナダ）", timezone: "America/Vancouver",
    availability: [{ days: [1, 2], start: "15:00:00", end: "18:00:00" }],
  },
  C2: {
    id: "COACH-02", seq: "02", name: "QAペルソナCOACH-02 Michael Brooks（アメリカ）", timezone: "America/New_York",
    availability: [{ days: [2], start: "18:00:00", end: "20:00:00" }, { days: [4], start: "08:00:00", end: "10:00:00" }],
  },
  C3: {
    id: "COACH-03", seq: "03", name: "QAペルソナCOACH-03 佐藤 美咲（日本）", timezone: "Asia/Tokyo",
    availability: [{ days: [4], start: "19:00:00", end: "21:00:00" }, { days: [6], start: "10:00:00", end: "12:00:00" }],
  },
};
const COACH_TENANT_NAME = "【QA固定】ペルソナ コーチ";

const STUDENTS: StudentPersona[] = [
  {
    id: "P01", seq: "01", name: "QAペルソナP01（毎日コツコツ・初級）", tenant: "A",
    schedule: { kind: "daily" }, daily: { words: 5, phrases: 20, sprints: 5 },
    slots: [[7, 8], [12, 13], [20, 22]], favorites: "few", levels: BEGINNER, scoreBase: 62,
  },
  {
    id: "P02", seq: "02", name: "QAペルソナP02（夜型・中級）", tenant: "B",
    schedule: { kind: "rest1to2" }, daily: { words: 10, phrases: 30, sprints: 8 },
    slots: [[23, 24], [24, 25]], favorites: "many", levels: INTERMEDIATE, scoreBase: 74,
  },
  {
    id: "P03", seq: "03", name: "QAペルソナP03（週末だけ・初級）", tenant: "A",
    schedule: { kind: "weekdays", days: [6, 0] }, daily: { words: 5, phrases: 10, sprints: 3 },
    slots: [[9, 11.5]], favorites: "none", levels: BEGINNER, scoreBase: 58,
  },
  {
    // レッスン（木曜19:00 JST、日本人コーチ）の前の火・水にまとめて学習する
    id: "P04", seq: "04", name: "QAペルソナP04（レッスン中心・中級）", tenant: "B",
    schedule: { kind: "weekdays", days: [2, 3] }, daily: { words: 10, phrases: 20, sprints: 5 },
    slots: [[20, 22.5]], favorites: "few", levels: INTERMEDIATE, scoreBase: 72,
    live: {
      plan: "LIVE_WEEKLY1_3M",
      slots: [{ slotNo: 1, coach: "C3", dayOfWeek: 4, startTime: "19:00:00", endTime: "19:30:00" }],
      cancellations: [{ coach: "C3", date: "2026-08-13", by: "student", reason: "お盆休みで帰省するため" }],
    },
  },
  {
    // 週2回（火曜朝 07:00 JST＝カナダのコーチ、木曜夜 21:00 JST＝アメリカのコーチ）で分担
    id: "P05", seq: "05", name: "QAペルソナP05（熱心・上級・ビジネス英語）", tenant: "B",
    schedule: { kind: "daily" }, daily: { words: 15, phrases: 40, sprints: 10 },
    slots: [[6, 7.5], [21.5, 23.5]], favorites: "many", levels: ADVANCED, scoreBase: 82,
    live: {
      plan: "LIVE_WEEKLY2_3M",
      slots: [
        { slotNo: 1, coach: "C1", dayOfWeek: 1, startTime: "15:00:00", endTime: "15:30:00" },
        { slotNo: 2, coach: "C2", dayOfWeek: 4, startTime: "08:00:00", endTime: "08:30:00" },
      ],
      cancellations: [{ coach: "C2", date: "2026-09-17", by: "coach", reason: "Family emergency. Sorry for the short notice." }],
    },
  },
  {
    id: "P06", seq: "06", name: "QAペルソナP06（始めたばかり）", tenant: "A",
    schedule: { kind: "none" }, daily: { words: 0, phrases: 0, sprints: 0 },
    slots: [], favorites: "none", scoreBase: 0, startsOnSeedDate: true,
  },
  {
    id: "P07", seq: "07", name: "QAペルソナP07（休眠中・初級）", tenant: "A",
    schedule: { kind: "daily" }, activeUntil: "2026-07-31", daily: { words: 5, phrases: 10, sprints: 3 },
    slots: [[20, 22]], favorites: "few", levels: BEGINNER, scoreBase: 60,
  },
  {
    id: "P08", seq: "08", name: "QAペルソナP08（研修担当・モニター）", tenant: "B", roles: ["monitor"],
    schedule: { kind: "weekdays", days: [2, 4] }, daily: { words: 5, phrases: 10, sprints: 3 },
    slots: [[12, 13]], favorites: "none", levels: { speed: 3, structure: 3, builders: 2, mastery: 2 }, scoreBase: 70,
  },
  {
    // 水曜朝 07:30 JST のレッスン。2026-08-12 からカナダのコーチ→アメリカのコーチへ交代
    id: "P09", seq: "09", name: "QAペルソナP09（コーチ交代あり・初級）", tenant: "A",
    schedule: { kind: "rest1to2" }, daily: { words: 5, phrases: 15, sprints: 3 },
    slots: [[7, 8.5], [19, 21]], favorites: "few", levels: BEGINNER, scoreBase: 60,
    live: {
      plan: "LIVE_WEEKLY1_3M",
      slots: [
        { slotNo: 1, coach: "C1", dayOfWeek: 2, startTime: "15:30:00", endTime: "16:00:00", until: "2026-08-11" },
        { slotNo: 1, coach: "C2", dayOfWeek: 2, startTime: "18:30:00", endTime: "19:00:00", from: "2026-08-12" },
      ],
    },
  },
  {
    id: "P10", seq: "10", name: "QAペルソナP10 Alexander Maximilian Vandenberg-Yamamoto（伸び盛り・個人契約）", tenant: "individual",
    schedule: { kind: "rest1to2" }, daily: { words: 10, phrases: 30, sprints: 8 },
    slots: [[7, 9], [12, 13], [19, 21], [22, 25]], slotsPerDay: 2, favorites: "many",
    levels: INTERMEDIATE,
    levelUps: [
      { date: "2026-08-01", levels: { speed: 5, structure: 4 } },
      { date: "2026-08-20", levels: { builders: 3 } },
      { date: "2026-09-10", levels: { speed: 6, mastery: 3 } },
      { date: "2026-09-25", levels: { speed: 7, structure: 5 } },
    ],
    scoreBase: 70,
  },
];

const TENANTS: Record<TenantKey, { name: string; clientType: ClientType; withLimitedContents: boolean }> = {
  A: { name: "【QA固定】ペルソナ 法人A（共通教材のみ）", clientType: 1, withLimitedContents: false },
  B: { name: "【QA固定】ペルソナ 法人B（専用教材あり）", clientType: 1, withLimitedContents: true },
  individual: { name: "【QA固定】ペルソナ 個人", clientType: 2, withLimitedContents: false },
};

/** 法人Bに付与する限定公開教材から除く教材（実在の顧客専用のコーパス等） */
const EXCLUDED_LIMITED_CONTENT = /holdings|コーパス|corpus|demo/i;

/** 共通公開の単語帳が無い環境（staging）で、代わりに全ペルソナ顧客へ付与する限定公開の単語帳 */
const FALLBACK_WORD_CONTENT = /^Pharmaceuticals$/;

// ---------------------------------------------------------------------------
// 教材
// ---------------------------------------------------------------------------
interface TenantContents {
  clientId: string;
  wordContentIds: string[];
  sprintContentId: string;
}

async function setupTenant(key: TenantKey): Promise<TenantContents> {
  const tenant = TENANTS[key];
  const clientId = await kit.ensureClient(tenant.name, tenant.clientType);

  const generic = await kit.ensureGenericSprintAccess(clientId, `${ACCESS_NOTE}（汎用スプリント）`);
  if (generic.length === 0) throw new Error("汎用スプリント（metadata.sprint.sprint_type='0'）の教材がありません。");

  const { data: common, error } = await admin
    .from("com_m_contents")
    .select("content_id")
    .eq("content_type", 0)
    .eq("content_scope", 0)
    .eq("delete_flg", "0")
    .order("content_name");
  if (error) throw error;
  const wordContentIds = (common ?? []).map((c) => c.content_id as string);

  if (wordContentIds.length === 0) {
    const { data: fallback, error: fallbackErr } = await admin
      .from("com_m_contents")
      .select("content_id, content_name")
      .eq("content_type", 0)
      .eq("content_scope", 1)
      .eq("delete_flg", "0");
    if (fallbackErr) throw fallbackErr;
    for (const c of fallback ?? []) {
      if (!FALLBACK_WORD_CONTENT.test(c.content_name as string)) continue;
      await kit.ensureContentAccess(clientId, c.content_id as string, ACCESS_NOTE);
      wordContentIds.push(c.content_id as string);
    }
  }

  if (tenant.withLimitedContents) {
    // 単語帳(0)・ダイアログ(3)の限定公開教材を付与する（実在顧客専用のものは除く）
    const { data: limited, error: limitedErr } = await admin
      .from("com_m_contents")
      .select("content_id, content_name, content_type")
      .in("content_type", [0, 3])
      .eq("content_scope", 1)
      .eq("delete_flg", "0")
      .order("content_name");
    if (limitedErr) throw limitedErr;
    for (const c of limited ?? []) {
      if (EXCLUDED_LIMITED_CONTENT.test(c.content_name as string)) continue;
      await kit.ensureContentAccess(clientId, c.content_id as string, ACCESS_NOTE);
      if (c.content_type === 0) wordContentIds.push(c.content_id as string);
    }
  }
  if (wordContentIds.length === 0) throw new Error(`${tenant.name}: 利用できる単語帳がありません。`);
  return { clientId, wordContentIds: [...new Set(wordContentIds)], sprintContentId: generic[0].contentId };
}

interface PoolQuestion {
  question_id: string;
  group_id: string | null;
  seq_no: number;
}

/** 汎用スプリントの問題（種別×レベルごと、出題順） */
const questionPool = new Map<string, PoolQuestion[]>();

async function loadQuestions(contentId: string, type: QuestionType, level: number): Promise<PoolQuestion[]> {
  const key = `${contentId}|${type}|${level}`;
  const cached = questionPool.get(key);
  if (cached) return cached;
  // 指定レベルに問題が無い場合は近いレベルから探す
  for (const lv of [level, level - 1, level + 1, level - 2, level + 2, 1, 0]) {
    if (lv < 0) continue;
    const { data, error } = await admin
      .from("com_m_sprint_questions")
      .select("question_id, group_id, seq_no")
      .eq("content_id", contentId)
      .eq("question_type", type)
      .eq("difficulty_level", lv)
      .order("group_id", { nullsFirst: false })
      .order("seq_no")
      .limit(400);
    if (error) throw error;
    if (data && data.length > 0) {
      questionPool.set(key, data as PoolQuestion[]);
      return data as PoolQuestion[];
    }
  }
  throw new Error(`スプリント問題が見つかりません: type=${type} level=${level}`);
}

async function loadPhraseIds(wordContentIds: string[]): Promise<string[]> {
  const { data: words, error } = await admin
    .from("com_m_word")
    .select("word_id")
    .in("content_id", wordContentIds)
    .eq("status", "live")
    .order("frequency_rank", { nullsFirst: false })
    .limit(300);
  if (error) throw error;
  const wordIds = (words ?? []).map((w) => w.word_id as string);
  const phraseIds: string[] = [];
  for (let i = 0; i < wordIds.length; i += 100) {
    const { data, error: phraseErr } = await admin
      .from("com_m_phrase")
      .select("phrase_id")
      .in("word_id", wordIds.slice(i, i + 100))
      .eq("status", "live");
    if (phraseErr) throw phraseErr;
    phraseIds.push(...(data ?? []).map((p) => p.phrase_id as string));
  }
  return phraseIds;
}

// ---------------------------------------------------------------------------
// 学習履歴の生成（DBに書く前の、あるべき姿）
// ---------------------------------------------------------------------------
const QUESTION_TYPES: { type: QuestionType; key: keyof Levels; weight: number }[] = [
  { type: "0", key: "speed", weight: 4 },
  { type: "4", key: "structure", weight: 3 },
  { type: "5", key: "builders", weight: 2 },
  { type: "6", key: "mastery", weight: 1 },
];
const TOTAL_TYPE_WEIGHT = QUESTION_TYPES.reduce((sum, t) => sum + t.weight, 0);

function pickQuestionType(rng: Rng): (typeof QUESTION_TYPES)[number] {
  let r = rng() * TOTAL_TYPE_WEIGHT;
  for (const t of QUESTION_TYPES) {
    r -= t.weight;
    if (r < 0) return t;
  }
  return QUESTION_TYPES[0];
}

function levelsOn(p: StudentPersona, date: string): Levels {
  const levels: Levels = { ...(p.levels ?? BEGINNER) };
  for (const up of p.levelUps ?? []) {
    if (up.date <= date) Object.assign(levels, up.levels);
  }
  return levels;
}

function isActive(p: StudentPersona, date: string): boolean {
  if (p.activeUntil && date > p.activeUntil) return false;
  switch (p.schedule.kind) {
    case "none":
      return false;
    case "daily":
      return true;
    case "weekdays":
      return p.schedule.days.includes(dayOfWeek(date));
    case "rest1to2": {
      const rng = rngFor(`${p.id}:rest:${weekIndex(date)}`);
      const restDays = new Set<number>();
      const count = between(rng, 1, 2);
      while (restDays.size < count) restDays.add(between(rng, 0, 6));
      return !restDays.has(dayOfWeek(date));
    }
  }
}

interface SprintHistoryItem {
  question_id: string;
  group_id: string | null;
  seq_no: number;
  is_skipped: boolean;
  assessment: { total_score: number } | null;
}

interface SprintRun {
  at: Date;
  type: (typeof QUESTION_TYPES)[number];
  level: number;
  timeLimitSec: number;
  answerType: "0" | "1";
  history: SprintHistoryItem[];
}

interface WordDay {
  contentId: string;
  date: string;
  words: number;
  phrases: number;
  assessments: number;
  first: Date;
  last: Date;
}

interface GeneratedHistory {
  wordDays: WordDay[];
  sprintRuns: SprintRun[];
  /** 学習した時刻（お気に入り登録の時刻に使う） */
  sessionTimes: Date[];
}

/** 1日分を時間帯に分け、その時間帯のどこかの時刻を返す */
function sessionTimesFor(p: StudentPersona, date: string, rng: Rng): Date[] {
  const slots = [...p.slots];
  const count = Math.min(p.slotsPerDay ?? slots.length, slots.length);
  const chosen: [number, number][] = [];
  while (chosen.length < count) chosen.push(slots.splice(Math.floor(rng() * slots.length), 1)[0]);
  return chosen
    .map(([from, to]) => jstAt(date, from + rng() * (to - from)))
    .sort((a, b) => a.getTime() - b.getTime());
}

/** n を k 個に分ける（合計 n、0 を含みうる） */
function split(rng: Rng, n: number, k: number): number[] {
  const parts = Array.from({ length: k }, () => 0);
  for (let i = 0; i < n; i++) parts[Math.floor(rng() * k)]++;
  return parts;
}

async function generateHistory(p: StudentPersona, contents: TenantContents): Promise<GeneratedHistory> {
  const wordDayMap = new Map<string, WordDay>();
  const sprintRuns: SprintRun[] = [];
  const sessionTimes: Date[] = [];

  for (let date = HISTORY_START; date < TODAY; date = addDays(date, 1)) {
    if (!isActive(p, date)) continue;
    const rng = rngFor(`${p.id}:${date}`);
    const times = sessionTimesFor(p, date, rng);
    if (times.length === 0) continue;
    sessionTimes.push(...times);

    const words = split(rng, jitter(rng, p.daily.words), times.length);
    const phrases = split(rng, jitter(rng, p.daily.phrases), times.length);
    const sprints = split(rng, jitter(rng, p.daily.sprints), times.length);
    const levels = levelsOn(p, date);
    const scoreBase = p.scoreBase + (levels.speed - (p.levels?.speed ?? levels.speed)) * 2;

    for (let s = 0; s < times.length; s++) {
      let at = times[s];
      // 単語帳: 日次サマリーは「学習した時刻のJSTの日付」×教材で集計する（深夜は翌日に入る）
      if (words[s] + phrases[s] > 0) {
        const contentId = pick(rng, contents.wordContentIds);
        const wordDate = jstDateOf(at);
        const key = `${contentId}|${wordDate}`;
        const assessments = Math.round(phrases[s] * (0.3 + rng() * 0.3));
        const current = wordDayMap.get(key);
        if (current) {
          current.words += words[s];
          current.phrases += phrases[s];
          current.assessments += assessments;
          current.last = at;
        } else {
          wordDayMap.set(key, { contentId, date: wordDate, words: words[s], phrases: phrases[s], assessments, first: at, last: at });
        }
        at = new Date(at.getTime() + between(rng, 4, 10) * 60_000);
      }

      // スプリント: 1回ごとに実施記録（self_t_sprint）を作る
      for (let r = 0; r < sprints[s]; r++) {
        const type = pickQuestionType(rng);
        const level = levels[type.key];
        const pool = await loadQuestions(contents.sprintContentId, type.type, level);
        const answered = between(rng, 4, 10) + Math.floor(level / 2);
        const startIndex = Math.floor(rng() * Math.max(1, pool.length - answered));
        const history: SprintHistoryItem[] = pool.slice(startIndex, startIndex + answered).map((q) => {
          const skipped = rng() < 0.1;
          const assessed = !skipped && rng() < 0.6;
          const score = Math.round(Math.min(100, Math.max(20, scoreBase + (rng() - 0.5) * 30)));
          return { question_id: q.question_id, group_id: q.group_id, seq_no: q.seq_no, is_skipped: skipped, assessment: assessed ? { total_score: score } : null };
        });
        sprintRuns.push({ at, type, level, timeLimitSec: pick(rng, [60, 90] as const), answerType: rng() < 0.5 ? "0" : "1", history });
        at = new Date(at.getTime() + between(rng, 2, 4) * 60_000);
      }
    }
  }
  return { wordDays: [...wordDayMap.values()], sprintRuns, sessionTimes };
}

// ---------------------------------------------------------------------------
// DBへの書き込み
// ---------------------------------------------------------------------------
async function insertInChunks(table: string, rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from(table).insert(rows.slice(i, i + 200));
    if (error) throw error;
  }
}

async function upsertInChunks(table: string, rows: Record<string, unknown>[], onConflict: string, ignoreDuplicates: boolean): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 200), { onConflict, ignoreDuplicates });
    if (error) throw error;
  }
}

async function writeWordSummaries(userId: string, days: WordDay[]): Promise<void> {
  const rows = days.map((d) => ({
    user_id: userId,
    content_id: d.contentId,
    training_date: d.date,
    word_count: d.words,
    phrase_count: d.phrases,
    assessment_count: d.assessments,
    insert_date: d.first.toISOString(),
    update_date: d.last.toISOString(),
  }));
  await upsertInChunks("self_t_word_summary", rows, "user_id,content_id,training_date", false);
}

async function writeSprints(userId: string, contentId: string, runs: SprintRun[]): Promise<number> {
  // 日次サマリー（教材×JSTの日付）
  const summary = new Map<string, { date: string; questions: number; assessments: number; byType: Record<QuestionType, number>; first: Date; last: Date }>();
  for (const run of runs) {
    const date = jstDateOf(run.at);
    const answered = run.history.filter((h) => !h.is_skipped).length;
    const assessed = run.history.filter((h) => h.assessment).length;
    const s = summary.get(date) ?? { date, questions: 0, assessments: 0, byType: { "0": 0, "4": 0, "5": 0, "6": 0 }, first: run.at, last: run.at };
    s.questions += answered;
    s.assessments += assessed;
    s.byType[run.type.type] += answered;
    s.last = run.at;
    summary.set(date, s);
  }
  await upsertInChunks(
    "self_t_sprint_summary",
    [...summary.values()].map((s) => ({
      user_id: userId,
      content_id: contentId,
      training_date: s.date,
      question_count: s.questions,
      assessment_count: s.assessments,
      speed_count: s.byType["0"],
      structure_count: s.byType["4"],
      builders_count: s.byType["5"],
      mastery_count: s.byType["6"],
      insert_date: s.first.toISOString(),
      update_date: s.last.toISOString(),
    })),
    "user_id,content_id,training_date",
    false,
  );

  // 実施記録（開始日時で重複を判定し、無いものだけ足す）
  const existing = new Set<number>();
  for (let page = 0; ; page++) {
    const { data, error } = await admin
      .from("self_t_sprint")
      .select("insert_date")
      .eq("user_id", userId)
      .gte("insert_date", jstAt(HISTORY_START, 0).toISOString())
      .order("insert_date")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    for (const r of data ?? []) existing.add(new Date(r.insert_date as string).getTime());
    if (!data || data.length < 1000) break;
  }
  const rows = runs
    .filter((run) => !existing.has(run.at.getTime()))
    .map((run) => ({
      user_id: userId,
      sprint_type: "0",
      content_id: contentId,
      question_type: run.type.type,
      answer_type: run.answerType,
      difficulty_level: run.level,
      time_limit_sec: run.timeLimitSec,
      total_answered: run.history.filter((h) => !h.is_skipped).length,
      total_assessments: run.history.filter((h) => h.assessment).length,
      answered_history: run.history,
      insert_date: run.at.toISOString(),
      update_date: run.at.toISOString(),
    }));
  await insertInChunks("self_t_sprint", rows);
  return rows.length;
}

/** 週ごとのお気に入り登録（few: 週2〜3件、many: 週8〜12件）。学習した時刻に登録したことにする */
async function writeFavorites(p: StudentPersona, userId: string, contents: TenantContents, phraseIds: string[], generated: GeneratedHistory): Promise<number> {
  if (p.favorites === "none" || generated.sessionTimes.length === 0) return 0;

  const timesByWeek = new Map<number, Date[]>();
  for (const t of generated.sessionTimes) {
    const w = weekIndex(jstDateOf(t));
    timesByWeek.set(w, [...(timesByWeek.get(w) ?? []), t]);
  }
  const answeredByWeek = new Map<number, string[]>();
  for (const run of generated.sprintRuns) {
    const w = weekIndex(jstDateOf(run.at));
    answeredByWeek.set(w, [...(answeredByWeek.get(w) ?? []), ...run.history.filter((h) => !h.is_skipped).map((h) => h.question_id)]);
  }

  const phraseRows: Record<string, unknown>[] = [];
  const questionRows: Record<string, unknown>[] = [];
  for (const [week, times] of timesByWeek) {
    const rng = rngFor(`${p.id}:fav:${week}`);
    const count = p.favorites === "few" ? between(rng, 2, 3) : between(rng, 8, 12);
    const answered = answeredByWeek.get(week) ?? [];
    for (let i = 0; i < count; i++) {
      const at = pick(rng, times).toISOString();
      if (answered.length > 0 && rng() < 0.4) {
        questionRows.push({ user_id: userId, question_id: pick(rng, answered), insert_date: at });
      } else if (phraseIds.length > 0) {
        phraseRows.push({ user_id: userId, phrase_id: pick(rng, phraseIds), insert_date: at });
      }
    }
  }
  // 単語帳（教材）のお気に入り: 最初の学習日にメインの単語帳を、many は汎用スプリントも
  const firstAt = generated.sessionTimes[0].toISOString();
  const contentRows: Record<string, unknown>[] = [{ user_id: userId, content_id: contents.wordContentIds[0], insert_date: firstAt }];
  if (p.favorites === "many") contentRows.push({ user_id: userId, content_id: contents.sprintContentId, insert_date: firstAt });

  await upsertInChunks("com_t_favorite_phrase", phraseRows, "user_id,phrase_id", true);
  await upsertInChunks("com_t_favorite_sprint_question", questionRows, "user_id,question_id", true);
  await upsertInChunks("com_t_favorite_contents", contentRows, "user_id,content_id", true);
  return phraseRows.length + questionRows.length + contentRows.length;
}

/**
 * 到達レベル。進捗行はユーザー作成時にDB側でレベル0のまま作られるため、レベル履歴が過去日付で
 * 記録済みかどうかで「設定済み」を判定する。未設定なら起点のレベルを HISTORY_START 付けで記録し直し、
 * レベルが上がった日ごとに進捗行を更新して、トリガーが記録した履歴の日時をその日へ付け替える。
 */
async function ensureLevels(p: StudentPersona, userId: string): Promise<void> {
  if (!p.levels) return;
  // トリガーは effective_at に現在時刻を入れる。過去へ付け替えた行と区別するため「今日以降」を対象にする
  const today = jstAt(TODAY, 0).toISOString();
  const { data: settled, error: settledErr } = await admin
    .from("student_t_sprint_level_history")
    .select("history_id")
    .eq("user_id", userId)
    .lt("effective_at", today)
    .limit(1);
  if (settledErr) throw settledErr;
  if (settled && settled.length > 0) return;

  const toRow = (l: Levels) => ({ level_speed: l.speed, level_structure: l.structure, level_builders: l.builders, level_mastery: l.mastery, stage: l.speed });
  const backdate = async (date: string): Promise<void> => {
    const { error } = await admin
      .from("student_t_sprint_level_history")
      .update({ effective_at: jstAt(date, 10).toISOString() })
      .eq("user_id", userId)
      .gte("effective_at", today);
    if (error) throw error;
  };

  const { error } = await admin.from("student_m_sprint_progress").upsert({ user_id: userId, ...toRow(p.levels) }, { onConflict: "user_id" });
  if (error) throw error;
  // 起点（レベル0の行と、0→起点レベルの引き上げ）を、起点のレベルだけの記録に置き換える
  const { error: delErr } = await admin.from("student_t_sprint_level_history").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  const origin = QUESTION_TYPES.map((t) => ({
    user_id: userId,
    question_type: Number(t.type),
    old_level: null,
    new_level: p.levels?.[t.key] ?? 0,
    change_kind: 0,
    effective_at: jstAt(HISTORY_START, 10).toISOString(),
  }));
  const { error: originErr } = await admin.from("student_t_sprint_level_history").insert(origin);
  if (originErr) throw originErr;
  for (const up of p.levelUps ?? []) {
    if (up.date >= TODAY) continue;
    const { error: upErr } = await admin.from("student_m_sprint_progress").update(toRow(levelsOn(p, up.date))).eq("user_id", userId);
    if (upErr) throw upErr;
    await backdate(up.date);
  }
}

/**
 * レベル管理の有無。アプリと同じく、ライブ契約の生徒だけレベル管理する（アプリのみ契約は全レベルを選べる。
 * アプリでは初期ライセンスの発行時に packages/lib/license/issue.ts が設定する）。
 */
async function ensureLevelManaged(p: StudentPersona, userId: string): Promise<void> {
  const { error } = await admin
    .from("student_m_sprint_progress")
    .upsert({ user_id: userId, level_managed: Boolean(p.live) }, { onConflict: "user_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// チャット（ライブ契約の生徒×担当コーチ。日時は JST）
// ---------------------------------------------------------------------------
type ChatScript = { from: string; date: string; hour: number; text: string }[];

interface ChatRoomSeed {
  student: string;
  coach: string;
  script: ChatScript;
  /** 生徒側で未読にする末尾の件数 */
  unreadForStudent?: number;
}

async function seedPersonaChats(ids: Record<string, string>): Promise<void> {
  const rooms: ChatRoomSeed[] = [
    {
      // 日本人コーチとの日本語のやり取り
      student: "P04", coach: "C3", unreadForStudent: 1,
      script: [
        { from: "C3", date: "2026-05-28", hour: 10, text: "はじめまして、コーチの佐藤です。木曜19時のレッスンでご一緒します。よろしくお願いします！" },
        { from: "P04", date: "2026-05-28", hour: 21.5, text: "よろしくお願いします。会議で発言できるようになりたいです。" },
        { from: "C3", date: "2026-06-05", hour: 9, text: "初回お疲れさまでした。今週は \"I'd like to add that...\" を使って、意見を付け足す練習をしてみましょう。" },
        { from: "P04", date: "2026-08-10", hour: 20, text: "13日はお盆で帰省するため、レッスンをお休みします。" },
        { from: "C3", date: "2026-08-10", hour: 22, text: "承知しました。良いお休みを！翌週また続きから進めましょう。" },
        { from: "P04", date: "2026-09-24", hour: 21, text: "今日のレッスンで教わった言い回し、さっそく会議で使えました！" },
        { from: "C3", date: "2026-09-25", hour: 8, text: "素晴らしいですね！次回はプレゼンの締めくくりの表現を扱います。" },
      ],
    },
    {
      student: "P05", coach: "C1",
      script: [
        { from: "C1", date: "2026-05-29", hour: 8, text: "Hi! I'm Emily, your coach for the Tuesday morning sessions. Looking forward to working with you!" },
        { from: "P05", date: "2026-05-29", hour: 22, text: "Nice to meet you, Emily. I'd like to focus on negotiation and giving bad news politely." },
        { from: "C1", date: "2026-07-06", hour: 23, text: "I've assigned a new dialogue: \"Delivering Bad News\". Please review session 1 before Tuesday." },
        { from: "P05", date: "2026-07-07", hour: 6.5, text: "Got it. I've gone through the slides." },
        { from: "C1", date: "2026-09-29", hour: 8, text: "Great progress today! Your softening phrases sounded very natural." },
      ],
    },
    {
      student: "P05", coach: "C2", unreadForStudent: 2,
      script: [
        { from: "C2", date: "2026-05-29", hour: 21, text: "Hi there! I'm Michael. I'll be your Thursday evening coach. See you soon!" },
        { from: "P05", date: "2026-05-29", hour: 22.5, text: "Thanks, Michael. See you on Thursday!" },
        { from: "C2", date: "2026-09-15", hour: 22, text: "I'm really sorry, but I have to cancel this Thursday's session due to a family emergency." },
        { from: "P05", date: "2026-09-15", hour: 23, text: "No problem at all. I hope everything is okay." },
        { from: "C2", date: "2026-09-30", hour: 22, text: "Thanks for your patience. For tomorrow, please prepare a short pitch about your company's strengths." },
        { from: "C2", date: "2026-09-30", hour: 22.1, text: "We'll use the \"Explaining Competitive Advantages\" dialogue." },
      ],
    },
    {
      // 交代前のコーチ（2026-08-11 まで）
      student: "P09", coach: "C1",
      script: [
        { from: "C1", date: "2026-05-29", hour: 9, text: "Hello! I'm Emily. Let's enjoy learning English together every Wednesday morning!" },
        { from: "P09", date: "2026-05-29", hour: 20, text: "よろしくお願いします。英語は初心者なので、ゆっくり話してもらえると助かります。" },
        { from: "C1", date: "2026-08-05", hour: 9, text: "I have some news: from next week, Michael will be your coach. It was a pleasure working with you!" },
        { from: "P09", date: "2026-08-05", hour: 20, text: "Thank you for everything, Emily!" },
      ],
    },
    {
      // 交代後のコーチ（2026-08-12 から）
      student: "P09", coach: "C2", unreadForStudent: 1,
      script: [
        { from: "C2", date: "2026-08-12", hour: 9, text: "Hi! I'm Michael, your new coach. Emily told me about your goals. Let's keep going!" },
        { from: "P09", date: "2026-08-12", hour: 20.5, text: "Nice to meet you, Michael. よろしくお願いします。" },
        { from: "C2", date: "2026-09-23", hour: 9, text: "Nice work today! Try to use \"Could you...?\" when you ask for something this week." },
      ],
    },
  ];

  for (const room of rooms) {
    const studentId = ids[room.student];
    const coachId = ids[room.coach];
    const roomId = await chat.ensureOneOnOneRoom(studentId, coachId);
    const messages: ChatMessageSeed[] = room.script.map((m) => ({ from: ids[m.from], text: m.text, at: jstAt(m.date, m.hour) }));
    const chatIds = await chat.seedMessages(roomId, messages);
    if (chatIds) {
      await chat.setLastRead(roomId, coachId, chatIds[chatIds.length - 1]);
      await chat.setLastRead(roomId, studentId, chatIds[chatIds.length - 1 - (room.unreadForStudent ?? 0)]);
    }
    console.log(`チャット ${room.student}×${room.coach}: ${chatIds ? `${chatIds.length}件投入` : "投入済み"}`);
  }
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------
console.log(`\n=== 利用者ペルソナ投入: env=${env} / 学習履歴 ${HISTORY_START}〜${addDays(TODAY, -1)} ===`);

const CUR = currentTermIndex(new Date());
const terms = [termOf(CUR - 1), termOf(CUR)];

const tenantContents = new Map<TenantKey, TenantContents>();
for (const key of Object.keys(TENANTS) as TenantKey[]) {
  tenantContents.set(key, await setupTenant(key));
  console.log(`顧客: ${TENANTS[key].name}`);
}
const phraseIdsByTenant = new Map<TenantKey, string[]>();

// --- コーチ ------------------------------------------------------------------
const coachClientId = await kit.ensureClient(COACH_TENANT_NAME, 1);
const coachUsers = {} as Record<CoachKey, LiveCoach>;
for (const key of Object.keys(COACHES) as CoachKey[]) {
  const c = COACHES[key];
  const email = `qa-p-coach-${c.seq}@gabby-qa-test.example`;
  const id = await kit.ensureUser({ email, userType: "2", userName: c.name, clientId: coachClientId, timezone: c.timezone });
  await kit.ensureCoachProfile(id);
  await live.ensureAvailabilities(id, c.timezone, c.availability);
  coachUsers[key] = { id, email, timezone: c.timezone };
  console.log(`- ${email} ${c.name}`);
}

/** コーチのローカル日付で、期間内の曜日 dow の回数（上限 cap） */
function countWeekdays(from: string, to: string, dow: number, cap: number): number {
  let n = 0;
  for (let d = addDays(from, (dow - dayOfWeek(from) + 7) % 7); d <= to && n < cap; d = addDays(d, 7)) n++;
  return n;
}

/** ライブ契約: タームごとに契約・ライセンス・チケット、枠ごとにスケジュールとセッションを作り、過去の回を完了にする */
async function ensureLive(p: StudentPersona, userId: string, clientId: string): Promise<{ created: number; completed: number }> {
  const liveCfg = p.live;
  if (!liveCfg) return { created: 0, completed: 0 };
  let created = 0;
  let completed = 0;
  for (const term of terms) {
    const contractId = await kit.ensureContract(clientId, liveCfg.plan, term, 10);
    const licenseId = await kit.ensureLicense(userId, contractId, term, 1);
    if (!licenseId) continue;
    const ticketId = await kit.ensureSessionTicket(licenseId, contractId, userId, liveCfg.plan);
    const termStart = jstDateOf(new Date(term.startIso));
    const termEnd = jstDateOf(new Date(term.endIso));

    // 同じ枠番号の担当（交代前→交代後）で、1枠あたりのセッション数を分け合う
    const usedBySlot = new Map<number, number>();
    for (const slot of liveCfg.slots) {
      const startDate = slot.from && slot.from > termStart ? slot.from : termStart;
      const endDate = slot.until && slot.until < termEnd ? slot.until : termEnd;
      if (startDate > endDate) continue;
      const used = usedBySlot.get(slot.slotNo) ?? 0;
      const target = slot.until && slot.until < termEnd
        ? countWeekdays(startDate, endDate, slot.dayOfWeek, SESSIONS_PER_SLOT - used)
        : SESSIONS_PER_SLOT - used;
      usedBySlot.set(slot.slotNo, used + target);
      if (target <= 0) continue;

      const seed: LiveScheduleSeed = {
        ticketId,
        studentId: userId,
        coach: coachUsers[slot.coach],
        slotNo: slot.slotNo,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        startDate,
        endDate,
        targetSessions: target,
        terminated: Boolean(slot.until && slot.until < termEnd),
        cancellations: (liveCfg.cancellations ?? []).filter((c) => c.coach === slot.coach),
      };
      const scheduleId = await live.ensureSchedule(seed);
      created += await live.ensureSessions(seed, scheduleId);
    }
    completed += await live.completePastSessions(ticketId, Object.values(coachUsers));
  }
  return { created, completed };
}

// --- 生徒 ------------------------------------------------------------------
const studentIds = {} as Record<string, string>;
const summary: Record<string, unknown>[] = [];
for (const p of STUDENTS) {
  const contents = tenantContents.get(p.tenant);
  if (!contents) throw new Error(`顧客が未作成です: ${p.tenant}`);
  const email = `qa-p-student-${p.seq}@gabby-qa-test.example`;
  const userId = await kit.ensureUser({ email, userType: "1", userName: p.name, clientId: contents.clientId, timezone: "Asia/Tokyo" });
  studentIds[p.id] = userId;
  for (const role of p.roles ?? []) await kit.ensureRole(userId, role);
  await kit.ensureLatestTermsAgreed(userId);

  // ライセンス: 前期・当期（ライブ契約は ensureLive で作る。新規ペルソナは初回投入日から当期末まで）
  if (!p.live) {
    for (const term of p.startsOnSeedDate ? [termOf(CUR)] : terms) {
      const contractId = await kit.ensureContract(contents.clientId, "BLUEPRINT_ONLY", term, 10);
      const period = p.startsOnSeedDate ? { startIso: jstAt(TODAY, 0).toISOString(), endIso: term.endIso, label: `${term.label}（${TODAY}開始）` } : term;
      await kit.ensureLicense(userId, contractId, period, 1);
    }
  }
  const liveResult = await ensureLive(p, userId, contents.clientId);

  await ensureLevels(p, userId);
  await ensureLevelManaged(p, userId);
  const generated = await generateHistory(p, contents);
  await writeWordSummaries(userId, generated.wordDays);
  const insertedRuns = await writeSprints(userId, contents.sprintContentId, generated.sprintRuns);

  let phraseIds = phraseIdsByTenant.get(p.tenant);
  if (!phraseIds) {
    phraseIds = await loadPhraseIds(contents.wordContentIds);
    phraseIdsByTenant.set(p.tenant, phraseIds);
  }
  const favorites = await writeFavorites(p, userId, contents, phraseIds, generated);

  summary.push({
    id: p.id,
    学習日数: new Set(generated.sessionTimes.map((t) => jstDateOf(t))).size,
    スプリント: `${generated.sprintRuns.length}回（追加 ${insertedRuns}）`,
    お気に入り登録数: favorites,
    ライブ: p.live ? `セッション作成 ${liveResult.created} / 完了 ${liveResult.completed}` : "-",
  });
  console.log(`- ${email} ${p.name}`);
}

// --- ダイアログ課題（P05: ビジネス英語プロ） ---------------------------------
{
  const studentId = studentIds.P05;
  const julyAug = await live.completedSessionDates(studentId, coachUsers.C1.id, "2026-07-06", "2026-08-31");
  const first = await live.ensureDialogueAssignment({
    studentId,
    coachId: coachUsers.C1.id,
    contentNames: ["B2 Delivering Bad News", "B1-B2 Asking for and Receiving Direct Feedback"],
    assignedDate: "2026-07-06",
    completedDates: julyAug.slice(0, 6),
  });
  const sept = await live.completedSessionDates(studentId, coachUsers.C2.id, "2026-09-01", TODAY);
  const second = await live.ensureDialogueAssignment({
    studentId,
    coachId: coachUsers.C2.id,
    contentNames: ["Set B: Explaining Competitive Advantages", "B2 Describing Graphs and Charts"],
    assignedDate: "2026-09-01",
    completedDates: sept.slice(0, 2),
  });
  console.log(`ダイアログ課題（P05）: ${first ?? "教材なし"} / ${second ?? "教材なし"}`);
}

// --- チャット ----------------------------------------------------------------
await seedPersonaChats({ ...studentIds, ...Object.fromEntries((Object.keys(coachUsers) as CoachKey[]).map((k) => [k, coachUsers[k].id])) });

console.log("\n=== 投入完了 ===");
console.table(summary);
