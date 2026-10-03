/**
 * 汎用スプリント教材（metadata.sprint.sprint_type='0'、dev では「Gabby NLT」）を環境間で移植する。
 * 利用者ペルソナ・状態ペルソナの投入（seed-user-personas.ts 等）は汎用スプリントを前提とするため、
 * 移植先に無い場合に使う。
 *
 * 移植するもの（ID は移植元と同じ。既にある行・ファイルはそのまま残す＝冪等）:
 *   - 教材（com_m_contents）
 *   - 問題（com_m_sprint_questions。削除済み delete_flg='1' の行も含めて同じ状態で写す）
 *   - 問題の音声ファイル（Storage の audio バケット。*_voice 列のパス）
 * 移植しないもの: 顧客ごとのアクセス権（com_m_contents_access）。固定アカウントの顧客へは各投入スクリプトが付与する。
 *
 * 使い方:
 *   pnpm exec tsx features/fixtures/copy-generic-sprint.ts --from=dev --to=staging [--dry-run]
 */
import { loadTestEnv, type TestEnv } from "../../helpers/env.ts";
import { createAdminClient } from "../../helpers/auth.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const AUDIO_BUCKET = "audio";
const VOICE_COLUMNS = ["statement_voice", "question_voice", "answer_sentence_yes_voice", "answer_sentence_no_voice"] as const;
const PAGE_SIZE = 1000;
const INSERT_CHUNK = 500;

function argValue(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}
function toEnv(value: string | undefined, name: string): TestEnv {
  if (value !== "dev" && value !== "staging") throw new Error(`--${name} には dev または staging を指定してください（指定値: ${value}）`);
  return value;
}

const fromEnv = toEnv(argValue("from"), "from");
const toEnvName = toEnv(argValue("to"), "to");
const dryRun = process.argv.includes("--dry-run");
if (fromEnv === toEnvName) throw new Error("--from と --to に同じ環境は指定できません。");

// loadTestEnv は process.env を上書きするため、クライアントを作ってから次の環境を読み込む
loadTestEnv(fromEnv);
const src = await createAdminClient();
loadTestEnv(toEnvName);
const dst = await createAdminClient();

type Row = Record<string, unknown>;

async function fetchAll(client: SupabaseClient, table: string, column: string, value: string, select = "*"): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from(table).select(select).eq(column, value).order("question_id").range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

const { data: contents, error: contentErr } = await src
  .from("com_m_contents")
  .select("*")
  .eq("content_type", 2)
  .eq("metadata->sprint->>sprint_type", "0");
if (contentErr) throw contentErr;
if (!contents?.length) throw new Error(`${fromEnv} に汎用スプリント教材がありません。`);

console.log(`=== 汎用スプリントの移植: ${fromEnv} → ${toEnvName}${dryRun ? "（dry-run）" : ""} ===`);

for (const content of contents as Row[]) {
  const contentId = content.content_id as string;
  console.log(`\n--- ${content.content_name}（${contentId}）`);

  const { data: existing, error: existErr } = await dst.from("com_m_contents").select("content_id").eq("content_id", contentId).maybeSingle();
  if (existErr) throw existErr;
  if (existing) {
    console.log("教材: 移植先に既にあるため変更しません");
  } else {
    console.log("教材: 追加します");
    if (!dryRun) {
      const { error } = await dst.from("com_m_contents").insert(content);
      if (error) throw error;
    }
  }

  const questions = await fetchAll(src, "com_m_sprint_questions", "content_id", contentId);
  const existingIds = new Set((await fetchAll(dst, "com_m_sprint_questions", "content_id", contentId, "question_id")).map((r) => r.question_id as string));
  const missing = questions.filter((q) => !existingIds.has(q.question_id as string));
  console.log(`問題: 移植元 ${questions.length}件 / 移植先に既存 ${existingIds.size}件 / 追加 ${missing.length}件`);
  if (!dryRun) {
    for (let i = 0; i < missing.length; i += INSERT_CHUNK) {
      const { error } = await dst.from("com_m_sprint_questions").insert(missing.slice(i, i + INSERT_CHUNK));
      if (error) throw error;
    }
  }

  const paths = [...new Set(questions.flatMap((q) => VOICE_COLUMNS.map((c) => q[c]).filter((p): p is string => typeof p === "string" && p !== "")))];
  let copied = 0;
  let skipped = 0;
  const failed: string[] = [];
  for (const path of paths) {
    const slash = path.lastIndexOf("/");
    const { data: found, error: listErr } = await dst.storage.from(AUDIO_BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1) });
    if (listErr) throw listErr;
    if (found?.some((f) => f.name === path.slice(slash + 1))) {
      skipped++;
      continue;
    }
    if (dryRun) {
      copied++;
      continue;
    }
    const { data: blob, error: dlErr } = await src.storage.from(AUDIO_BUCKET).download(path);
    if (dlErr || !blob) {
      failed.push(path);
      continue;
    }
    const { error: upErr } = await dst.storage.from(AUDIO_BUCKET).upload(path, blob, { contentType: blob.type || "audio/mpeg", upsert: false });
    if (upErr) failed.push(`${path}（${upErr.message}）`);
    else copied++;
  }
  console.log(`音声: ${paths.length}件中 追加 ${copied}件 / 既存 ${skipped}件 / 失敗 ${failed.length}件`);
  for (const f of failed) console.log(`  失敗: ${f}`);
}
