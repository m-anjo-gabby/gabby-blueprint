// scripts/video-import/run.mjs
//
// 旧システムのビデオ（D:\work\video 等に落とした runnow / on-demand / cvc）を、ビデオ教材として取り込む。
// 教材・セクション・並び順・タイトルは catalog.json（旧マスタと割り当て表から作った定義）が正本。
// 運用手順は同ディレクトリの README.md を参照。
//
// 使い方（リポジトリ直下で実行）:
//   node scripts/video-import/run.mjs --env=dev --src=D:/work/video             計画の表示のみ（DB は読むだけ）
//   node scripts/video-import/run.mjs --env=dev --src=D:/work/video --prepare   置くファイルを作る（DB に接続しない）
//   node scripts/video-import/run.mjs --env=dev --src=D:/work/video --apply     ファイルを作り、確認のうえ取り込む
//
// オプション:
//   --only=VIDEO_LD,VIDEO_CVC   対象の教材をラベルで絞る
//   --work=<dir>                作ったファイルの置き場所（既定は <src>/_build。作り直さずに使い回す）
//
// ffmpeg / ffprobe は PATH から探す。PATH に無い場合は環境変数 FFMPEG_DIR にその置き場所を指定する。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createR2Bucket, readR2BucketConfig } from '../../packages/lib/r2/bucket.ts';
import { buildVideoObjectKey, checkVideoFile } from '../../packages/lib/video/files.ts';
import { CONTENT_STATUS } from '../../packages/types/content.ts';
import { VIDEO_STATUS } from '../../packages/types/video.ts';
import { MANIFEST } from '../vercel-env/manifest.mjs';
import {
  clipEncodeArgs,
  ENVS,
  FILE_MODE,
  flattenCatalog,
  fullEncodeArgs,
  needsReencode,
  planImport,
  sectionKey,
  thumbnailArgs,
  validateCatalog,
} from './lib.mjs';

// @supabase/supabase-js はルートに hoist されていないため、admin アプリの依存から解決する
const require = createRequire(new URL('../../apps/admin/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const RELEASE_ENV_DIR = path.join(REPO_ROOT, 'supabase/release/env');

function parseArgs(argv) {
  const args = Object.fromEntries(
    argv.map((a) => {
      const [k, ...v] = a.replace(/^--/, '').split('=');
      return [k, v.length ? v.join('=') : true];
    }),
  );
  if (!ENVS.includes(args.env)) throw new Error(`--env は ${ENVS.join(' / ')} のどれかを指定してください。`);
  if (typeof args.src !== 'string') throw new Error('--src に旧システムのビデオを落としたフォルダを指定してください。');
  return {
    env: args.env,
    src: path.resolve(args.src),
    work: path.resolve(typeof args.work === 'string' ? args.work : path.join(args.src, '_build')),
    only: typeof args.only === 'string' ? new Set(args.only.split(',')) : null,
    prepare: args.prepare === true,
    apply: args.apply === true,
  };
}

// ---- ffmpeg ----

function tool(name) {
  return process.env.FFMPEG_DIR ? path.join(process.env.FFMPEG_DIR, name) : name;
}

function run(name, args) {
  const result = spawnSync(tool(name), args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error)
    throw new Error(`${name} を実行できません（PATH か FFMPEG_DIR を確認してください）: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${name} が失敗しました: ${result.stderr.trim()}`);
  return result.stdout;
}

function probe(file) {
  const json = JSON.parse(
    run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,bit_rate,height',
      '-of',
      'json',
      file,
    ]),
  );
  const video = json.streams.find((s) => s.codec_type === 'video');
  return {
    durationSec: Number(json.format.duration),
    videoBitRate: Number(video?.bit_rate ?? 0),
    height: Number(video?.height ?? 0),
  };
}

/** 途中で止めても壊れたファイルを残さないよう、別名で作ってから置き換える（buildArgs は出力先を受け取って引数を返す） */
function encode(buildArgs, out) {
  mkdirSync(path.dirname(out), { recursive: true });
  const ext = path.extname(out);
  const part = `${out.slice(0, -ext.length)}.part${ext}`;
  try {
    run('ffmpeg', buildArgs(part));
    renameSync(part, out);
  } finally {
    rmSync(part, { force: true });
  }
}

/** 置くファイル（動画・サムネイル）の場所。作っていない場合は make=true で作る */
function preparedFiles(opts, video, { make }) {
  const mode = FILE_MODE[opts.env];
  const src = path.join(opts.src, video.video);
  const thumbSrc = path.join(opts.src, video.thumbnail);
  const thumb = path.join(opts.work, 'thumb', `${path.parse(video.legacyCode).name}.webp`);
  let videoFile = path.join(opts.work, mode, video.legacyCode);

  if (!existsSync(videoFile) && mode === 'full' && !needsReencode(probe(src))) videoFile = src;
  const missing = [videoFile, thumb].filter((f) => !existsSync(f));
  if (missing.length === 0 || !make) return { videoFile, thumb, ready: missing.length === 0 };

  if (!existsSync(videoFile)) {
    const durationSec = mode === 'clip' ? probe(src).durationSec : 0;
    encode((out) => (mode === 'clip' ? clipEncodeArgs(src, out, durationSec) : fullEncodeArgs(src, out)), videoFile);
  }
  if (!existsSync(thumb)) encode((out) => thumbnailArgs(thumbSrc, out), thumb);
  return { videoFile, thumb, ready: true };
}

// ---- 接続先 ----

/** supabase/release/env/.env.<env> の接続先（リリーススクリプトと同じファイル）。取り違えを防ぐため URL とプロジェクトを突き合わせる */
function connect(envName) {
  const envPath = path.join(RELEASE_ENV_DIR, `.env.${envName}`);
  if (!existsSync(envPath)) throw new Error(`環境ファイルがありません: ${path.relative(REPO_ROOT, envPath)}`);
  const vars = parseEnv(readFileSync(envPath, 'utf8'));
  const { SUPABASE_PROJECT_REF: ref, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = vars;
  if (!ref || !url || !key)
    throw new Error(
      `${path.basename(envPath)} の SUPABASE_PROJECT_REF / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。`,
    );
  if (new URL(url).host !== `${ref}.supabase.co`)
    throw new Error(`SUPABASE_URL (${url}) が SUPABASE_PROJECT_REF (${ref}) と一致しません。`);
  return { ref, supabase: createClient(url, key, { auth: { persistSession: false } }) };
}

/**
 * ビデオのファイルの置き場所（R2）。アプリ（packages/lib/video/storage.ts）と同じバケットに置く。
 * バケット名は環境変数の定義（scripts/vercel-env/manifest.mjs の R2_VIDEO_BUCKET）で環境ごとに決まる。
 * 鍵は、dev は apps/admin/.env.local、staging・本番は環境変数の値ファイル（scripts/vercel-env/values/.env.<env>）から読む。
 */
function createVideoStorage(envName) {
  const envPath =
    envName === 'dev'
      ? path.join(REPO_ROOT, 'apps/admin/.env.local')
      : path.join(REPO_ROOT, `scripts/vercel-env/values/.env.${envName}`);
  if (!existsSync(envPath)) throw new Error(`環境ファイルがありません: ${path.relative(REPO_ROOT, envPath)}`);
  const { value } = MANIFEST.find((d) => d.key === 'R2_VIDEO_BUCKET');
  const expected = value[envName] ?? value.default;
  const vars = parseEnv(readFileSync(envPath, 'utf8'));
  // 取り違えを防ぐため、.env.local に書いたバケット名も環境のものかを確かめる
  if (vars.R2_VIDEO_BUCKET && vars.R2_VIDEO_BUCKET !== expected)
    throw new Error(
      `${path.basename(envPath)} の R2_VIDEO_BUCKET (${vars.R2_VIDEO_BUCKET}) が ${expected} ではありません。`,
    );
  const config = readR2BucketConfig('R2_VIDEO_BUCKET', { ...vars, R2_VIDEO_BUCKET: expected });
  const bucket = createR2Bucket(config);
  return {
    name: config.bucket,
    async upload(key, file, contentType) {
      await bucket.put(key, readFileSync(file), contentType);
    },
    async remove(keys) {
      const { failed } = await bucket.remove(keys);
      if (failed.length > 0)
        console.warn(`  ファイルの削除に失敗しました（手で消してください）: ${failed.map((f) => f.key).join(', ')}`);
    },
  };
}

async function loadExisting(supabase, catalog) {
  const labels = catalog.contents.map((c) => c.label);
  const codes = flattenCatalog(catalog).map((v) => v.video.legacyCode);

  const { data: contents, error } = await supabase
    .from('com_m_contents')
    .select('content_id, content_label')
    .eq('content_type', 1)
    .in('content_label', labels);
  if (error) throw error;
  const contentIdByLabel = new Map();
  for (const c of contents) {
    if (contentIdByLabel.has(c.content_label))
      throw new Error(`同じラベルのビデオ教材が複数あります: ${c.content_label}`);
    contentIdByLabel.set(c.content_label, c.content_id);
  }

  const sectionIdByKey = new Map();
  if (contentIdByLabel.size > 0) {
    const { data: sections, error: sectionError } = await supabase
      .from('com_m_video_section')
      .select('section_id, content_id, section_name')
      .in('content_id', [...contentIdByLabel.values()]);
    if (sectionError) throw sectionError;
    for (const s of sections) sectionIdByKey.set(sectionKey(s.content_id, s.section_name), s.section_id);
  }

  const { data: videos, error: videoError } = await supabase
    .from('com_m_video')
    .select('legacy_code')
    .in('legacy_code', codes);
  if (videoError) throw videoError;
  return { contentIdByLabel, sectionIdByKey, legacyCodes: new Set(videos.map((v) => v.legacy_code)) };
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => (rl.close(), resolve(answer.trim()))));
}

async function insertRow(supabase, table, row, idColumn) {
  const { data, error } = await supabase.from(table).insert(row).select(idColumn).single();
  if (error) throw new Error(`${table} の追加に失敗しました: ${error.message}`);
  return data[idColumn];
}

async function importVideo(opts, supabase, storage, sectionId, { video, seq }) {
  const { videoFile, thumb } = preparedFiles(opts, video, { make: true });
  const videoId = crypto.randomUUID();
  const files = [
    { file: videoFile, type: 'video/mp4', kind: 'video' },
    { file: thumb, type: 'image/webp', kind: 'thumbnail' },
  ].map((f) => {
    const checked = checkVideoFile(f.kind, { type: f.type, size: statSync(f.file).size });
    if (!checked.ok) throw new Error(`アップロードできないファイルです（${checked.error}）: ${f.file}`);
    return { ...f, key: buildVideoObjectKey(videoId, checked.extension) };
  });

  const uploaded = [];
  try {
    for (const f of files) {
      await storage.upload(f.key, f.file, f.type);
      uploaded.push(f.key);
    }
    await insertRow(
      supabase,
      'com_m_video',
      {
        video_id: videoId,
        section_id: sectionId,
        title: video.title,
        title_en: video.titleEn ?? null,
        description: video.description ?? null,
        video_path: files[0].key,
        thumbnail_path: files[1].key,
        // admin の登録と同じく、置いたファイルから測る（dev・staging は切り出しの長さになる）
        duration_sec: Math.round(probe(videoFile).durationSec),
        seq_no: seq,
        // 公開は教材の単位で決める（教材は非公開で作るため、ビデオは公開にしておく）
        status: VIDEO_STATUS.PUBLISHED,
        legacy_code: video.legacyCode,
      },
      'video_id',
    );
  } catch (e) {
    if (uploaded.length > 0) await storage.remove(uploaded);
    throw e;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const fullCatalog = JSON.parse(readFileSync(path.join(SCRIPT_DIR, 'catalog.json'), 'utf8'));
  const errors = validateCatalog(fullCatalog);
  if (errors.length > 0) throw new Error(`catalog.json に誤りがあります:\n  ${errors.join('\n  ')}`);
  const catalog = {
    contents: fullCatalog.contents.filter((c) => !opts.only || opts.only.has(c.label)),
  };
  const items = flattenCatalog(catalog);

  const lacking = items
    .flatMap(({ video }) => [video.video, video.thumbnail])
    .filter((f) => !existsSync(path.join(opts.src, f)));
  if (lacking.length > 0) throw new Error(`元のファイルが見つかりません:\n  ${lacking.join('\n  ')}`);

  const mode = FILE_MODE[opts.env];
  console.log(
    `環境: ${opts.env}（動画: ${mode === 'full' ? '実物' : '切り出し'}）  元: ${opts.src}  作業: ${opts.work}`,
  );
  console.log(`対象: 教材 ${catalog.contents.length} 件 / ビデオ ${items.length} 本`);

  if (opts.prepare) {
    for (const [i, { video }] of items.entries()) {
      process.stdout.write(`\r  ファイルを作成中 ${i + 1}/${items.length} ${video.legacyCode}`.padEnd(70));
      preparedFiles(opts, video, { make: true });
    }
    console.log('\nファイルの作成が終わりました。');
    return;
  }

  const { ref, supabase } = connect(opts.env);
  console.log(`接続先: ${ref}`);
  const plan = planImport(catalog, await loadExisting(supabase, catalog));
  for (const { content, contentId, sections } of plan.contents) {
    const counts = sections.flatMap((s) => s.videos).reduce((n, v) => n + (v.exists ? 0 : 1), 0);
    console.log(
      `  ${contentId ? '既存' : '新規'} ${content.label}「${content.name}」 セクション ${sections.length} / 追加するビデオ ${counts}`,
    );
  }
  console.log(`追加するビデオ: ${plan.newVideos} 本（取り込み済み ${plan.existingVideos} 本は変更しません）`);
  const notReady = items.filter(({ video }) => !preparedFiles(opts, video, { make: false }).ready).length;
  if (notReady > 0)
    console.log(`未作成のファイル: ${notReady} 本分（--apply の途中で作ります。先に作る場合は --prepare）`);

  if (!opts.apply) {
    console.log('\n計画の表示のみです。取り込む場合は --apply を付けて実行してください。');
    return;
  }
  if (plan.newVideos === 0 && plan.contents.every((c) => c.contentId && c.sections.every((s) => s.sectionId))) {
    console.log('追加するものはありません。');
    return;
  }

  const storage = createVideoStorage(opts.env);
  console.log(`ファイルの置き場所: R2 ${storage.name}`);
  const answer = await ask(
    opts.env === 'dev' ? '\n取り込みますか？ (y/N): ' : `\n取り込む場合は環境名（${opts.env}）を入力してください: `,
  );
  if (answer !== (opts.env === 'dev' ? 'y' : opts.env)) {
    console.log('中止しました。');
    return;
  }

  let done = 0;
  for (const { content, seq, contentId: existingContentId, sections } of plan.contents) {
    const contentId =
      existingContentId ??
      (await insertRow(
        supabase,
        'com_m_contents',
        {
          content_name: content.name,
          content_name_en: content.nameEn ?? null,
          description: content.description ?? null,
          content_label: content.label,
          content_type: 1,
          category_id: content.category,
          seq_no: seq,
          // 教材は非公開で作り、admin のプレビューで確かめてから公開する
          status: CONTENT_STATUS.UNPUBLISHED,
          content_scope: 0,
        },
        'content_id',
      ));
    for (const { section, seq: sectionSeq, sectionId: existingSectionId, videos } of sections) {
      const sectionId =
        existingSectionId ??
        (await insertRow(
          supabase,
          'com_m_video_section',
          {
            content_id: contentId,
            section_name: section.name,
            section_name_en: section.nameEn ?? null,
            seq_no: sectionSeq,
          },
          'section_id',
        ));
      for (const v of videos.filter((x) => !x.exists)) {
        process.stdout.write(`\r  取り込み中 ${++done}/${plan.newVideos} ${v.video.legacyCode}`.padEnd(70));
        await importVideo(opts, supabase, storage, sectionId, v);
      }
    }
  }
  console.log(
    `\n取り込みが終わりました（ビデオ ${done} 本）。教材は非公開です。admin のプレビューで確かめてから公開してください。`,
  );
}

main().catch((e) => {
  console.error(`\nエラー: ${e.message}`);
  process.exit(1);
});
