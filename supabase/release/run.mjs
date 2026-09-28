// supabase/release/run.mjs
//
// リリーススクリプト（supabase/release/*.sql）を dev / staging / prod に適用する実行ツール。
// SQLは Supabase Management API（POST /v1/projects/{ref}/database/query）で実行し、
// SQL内に `-- @post: <コマンド>` で記載された適用後作業（データ移行スクリプト等）も
// 確認を挟みながら順番に実行する。適用結果は各環境のDB（ops.release_history）に記録し、
// 適用済みセクションの再実行を防ぐ。運用手順は同ディレクトリの README.md を参照。
//
// 使い方（リポジトリ直下で実行）:
//   node supabase/release/run.mjs <file> --list                          セクション一覧（DB接続なし）
//   node supabase/release/run.mjs <file> --env=staging --status          環境ごとの適用状況
//   node supabase/release/run.mjs <file> --env=staging --sections=pending 未適用セクションをすべて適用
//   node supabase/release/run.mjs <file> --env=dev --sections=8           指定セクションを適用
//   node supabase/release/run.mjs <file> --env=dev --mark-applied=1,2     適用済みとして記録のみ
//
// オプション:
//   --env=dev|staging|prod   接続先（supabase/release/env/.env.<env> を読み込む）
//   --list                   セクション一覧と適用後作業を表示して終了
//   --status                 適用状況（未適用/適用済み/適用後に内容変更あり）を表示して終了
//   --sections=pending|all|1,3  実行するセクション。セクションが複数あるファイルでは必須
//   --mark-applied=all|1,3   SQLを実行せず「適用済み」として記録する（run.mjs導入前にSQLエディタで適用した分など）
//   --reapply                適用済みセクションの再実行を許可する（冪等なセクションのみ）
//   --skip-post              適用後作業（@post）を実行しない

import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const RELEASE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(RELEASE_DIR, '../..');
const ENV_DIR = path.join(RELEASE_DIR, 'env');
const LOG_DIR = path.join(RELEASE_DIR, 'logs');
const HISTORY_DDL = path.join(REPO_ROOT, 'supabase/DDL/table/ops_release_history.sql');
const API_BASE = 'https://api.supabase.com/v1';

const ENVS = ['dev', 'staging', 'prod'];
// 取り違え防止: プロジェクト名にこの文字列が含まれない場合は中止する（blueprint-dev/stg/prod）
const PROJECT_NAME_HINT = { dev: 'dev', staging: 'stg', prod: 'prod' };

// ---------------------------------------------------------------------------
// 引数・入力
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    env: undefined, file: undefined, list: false, status: false,
    sections: undefined, markApplied: undefined, reapply: false, skipPost: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--env=')) opts.env = arg.slice('--env='.length);
    else if (arg.startsWith('--sections=')) opts.sections = arg.slice('--sections='.length);
    else if (arg.startsWith('--mark-applied=')) opts.markApplied = arg.slice('--mark-applied='.length);
    else if (arg === '--list') opts.list = true;
    else if (arg === '--status') opts.status = true;
    else if (arg === '--reapply') opts.reapply = true;
    else if (arg === '--skip-post') opts.skipPost = true;
    else if (arg.startsWith('--')) fail(`不明なオプションです: ${arg}`);
    else opts.file = arg;
  }
  if (!opts.file) fail('リリーススクリプトのファイル名を指定してください。');
  if (!opts.list && !ENVS.includes(opts.env)) fail(`--env には ${ENVS.join(' / ')} のいずれかを指定してください。`);
  if (opts.sections && opts.markApplied) fail('--sections と --mark-applied は同時に指定できません。');
  return opts;
}

function fail(message) {
  console.error(`\n[中止] ${message}`);
  process.exit(1);
}

/**
 * 確認プロンプト用の入力。プロセス全体で1つの行リーダーを共有する
 * （プロンプトごとに readline を作り直すと、先行の読み込みで後続の入力行が失われるため）。
 * terminal: false（cooked mode）とし、@post の子プロセス実行中も Ctrl+C 等が通常どおり効くようにする。
 */
const lineReader = {
  rl: undefined,
  buffered: [],
  waiters: [],
  closed: false,
  start() {
    if (this.rl) return;
    this.rl = readline.createInterface({ input: process.stdin, terminal: false });
    this.rl.on('line', (line) => {
      const waiter = this.waiters.shift();
      if (waiter) waiter(line);
      else this.buffered.push(line);
    });
    this.rl.on('close', () => {
      this.closed = true;
      while (this.waiters.length > 0) this.waiters.shift()('');
    });
  },
  stop() {
    this.rl?.close();
  },
};

function ask(question) {
  lineReader.start();
  process.stdout.write(question);
  return new Promise((resolve) => {
    if (lineReader.buffered.length > 0) resolve(lineReader.buffered.shift().trim());
    else if (lineReader.closed) resolve('');
    else lineReader.waiters.push((line) => resolve(line.trim()));
  });
}

/** 入力内容を表示しない入力（トークン用）。確認プロンプトより前に1回だけ使う */
function askSecret(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    // close() は 'close' イベントを同期的に発火するため、回答を先に確定させてから閉じる
    rl.on('close', () => resolve(''));
    rl.question(question, (answer) => {
      resolve(answer.trim());
      process.stdout.write('\n');
      rl.close();
    });
  });
}

// ---------------------------------------------------------------------------
// リリーススクリプトの解析
// ---------------------------------------------------------------------------
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * 「-- ====」行の直後の行に【追加セクション】を含む位置でファイルを分割する。
 * 先頭（最初の追加セクションより前）をセクション1とする。
 */
function splitSections(sql) {
  const lines = sql.split(/\r?\n/);
  const starts = [0];
  for (let i = 1; i < lines.length; i++) {
    if (/^--\s*={10,}/.test(lines[i]) && lines[i + 1]?.includes('【追加セクション】')) starts.push(i);
  }
  return starts.map((start, idx) => {
    const end = starts[idx + 1] ?? lines.length;
    const body = lines.slice(start, end);
    const titleLine = idx === 0
      ? body.find((l) => l.includes('対象ブランチ')) ?? body.find((l) => /^--\s*\S/.test(l) && !/={10,}/.test(l))
      : body[1];
    const title = (titleLine ?? '').replace(/^--\s*/, '').replace('【追加セクション】', '').trim();
    const posts = body
      .map((l) => l.match(/^--\s*@post:\s*(.+?)\s*$/)?.[1])
      .filter(Boolean);
    const sqlText = body.join('\n');
    return {
      no: idx + 1,
      title: idx === 0 ? `ファイル先頭 (${title})` : title,
      sql: sqlText,
      sha256: sha256(sqlText.trim()),
      posts,
    };
  });
}

function parseSectionNos(spec, sections) {
  if (spec === 'all') return sections.map((s) => s.no);
  const nos = spec.split(',').map((s) => Number(s.trim()));
  const invalid = nos.filter((n) => !sections.some((s) => s.no === n));
  if (invalid.length > 0) fail(`存在しないセクション番号です: ${invalid.join(', ')}`);
  return nos;
}

// ---------------------------------------------------------------------------
// Management API
// ---------------------------------------------------------------------------
async function api(token, method, pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const message = typeof json === 'object' && json?.message ? json.message : text;
    throw new Error(`HTTP ${res.status}: ${message}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// 適用履歴（ops.release_history）
// ---------------------------------------------------------------------------
function lit(value) {
  return value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
}

function historyInsertSql(record) {
  return `INSERT INTO ops.release_history
  (release_file, section_no, section_title, section_sha256, step_type, command, status, applied_by, git_commit, note)
VALUES (${lit(record.file)}, ${record.section.no}, ${lit(record.section.title)}, ${lit(record.section.sha256)},
  ${lit(record.stepType)}, ${lit(record.command)}, ${lit(record.status)}, ${lit(record.appliedBy)}, ${lit(record.gitCommit)}, ${lit(record.note)});`;
}

/** 適用履歴を取得する（テーブル未作成＝run.mjs未使用の環境では空として扱う。読み取りのみ） */
async function fetchHistory(query, file) {
  const [exists] = await query(`SELECT to_regclass('ops.release_history') IS NOT NULL AS ok;`);
  if (!exists?.ok) return [];
  return query(`SELECT section_no, section_sha256, step_type, command, status, applied_by, applied_at
FROM ops.release_history WHERE release_file = ${lit(file)} ORDER BY applied_at;`);
}

/** セクションごとの状態: pending / applied / changed（適用後に内容が変更された） */
function sectionState(section, history) {
  const applied = history.filter(
    (h) => h.step_type === 'sql' && h.section_no === section.no && ['applied', 'marked'].includes(h.status)
  );
  if (applied.length === 0) return { state: 'pending' };
  const last = applied[applied.length - 1];
  return { state: last.section_sha256 === section.sha256 ? 'applied' : 'changed', last };
}

// ---------------------------------------------------------------------------
// ログ
// ---------------------------------------------------------------------------
function git(cmd) {
  try { return execSync(`git ${cmd}`, { cwd: REPO_ROOT }).toString().trim(); } catch { return 'unknown'; }
}

function writeLog(log) {
  mkdirSync(LOG_DIR, { recursive: true });
  const stamp = log.startedAt.replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const file = path.join(LOG_DIR, `${stamp}_${log.env}_${path.basename(log.file, '.sql')}.json`);
  writeFileSync(file, JSON.stringify(log, null, 2) + '\n');
  return path.relative(REPO_ROOT, file);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const sqlPath = path.isAbsolute(opts.file) || opts.file.includes('/') || opts.file.includes('\\')
    ? path.resolve(REPO_ROOT, opts.file)
    : path.join(RELEASE_DIR, opts.file);
  if (!existsSync(sqlPath)) fail(`ファイルが見つかりません: ${sqlPath}`);
  const fileName = path.basename(sqlPath);
  const sqlText = readFileSync(sqlPath, 'utf8');
  const fileSha256 = sha256(sqlText);
  const sections = splitSections(sqlText);

  if (opts.list) {
    console.log(`\n${fileName}  (sha256: ${fileSha256.slice(0, 12)})`);
    for (const s of sections) {
      console.log(`  [${s.no}] ${s.title}`);
      s.posts.forEach((p) => console.log(`        @post: ${p}`));
    }
    return;
  }

  // --- 接続情報の読み込みと取り違えチェック ---
  const envPath = path.join(ENV_DIR, `.env.${opts.env}`);
  if (!existsSync(envPath)) fail(`環境ファイルがありません: ${path.relative(REPO_ROOT, envPath)}（.env.example を参考に作成してください）`);
  const envVars = parseEnv(readFileSync(envPath, 'utf8'));
  const ref = envVars.SUPABASE_PROJECT_REF;
  if (!ref) fail('SUPABASE_PROJECT_REF が未設定です。');
  if (envVars.SUPABASE_URL && new URL(envVars.SUPABASE_URL).host !== `${ref}.supabase.co`) {
    fail(`SUPABASE_URL (${envVars.SUPABASE_URL}) が SUPABASE_PROJECT_REF (${ref}) と一致しません。`);
  }

  let token = envVars.SUPABASE_ACCESS_TOKEN;
  if (!token) token = await askSecret('SUPABASE_ACCESS_TOKEN を入力してください（入力内容は表示されません）: ');
  if (!token) fail('アクセストークンが入力されませんでした。');

  const project = await api(token, 'GET', `/projects/${ref}`).catch((e) => fail(`プロジェクト情報の取得に失敗しました: ${e.message}`));
  if (!project.name.includes(PROJECT_NAME_HINT[opts.env])) {
    fail(`--env=${opts.env} に対し、プロジェクト名が「${project.name}」です。環境ファイルの取り違えがないか確認してください。`);
  }

  const query = (sql) => api(token, 'POST', `/projects/${ref}/database/query`, { query: sql });
  const history = await fetchHistory(query, fileName).catch((e) => fail(`適用履歴の取得に失敗しました: ${e.message}`));
  const states = new Map(sections.map((s) => [s.no, sectionState(s, history)]));

  const printHeader = (label) => {
    console.log('\n========================================================');
    console.log(` 環境       : ${opts.env.toUpperCase()}`);
    console.log(` プロジェクト: ${project.name} (${ref})`);
    console.log(` ファイル   : ${fileName}  (sha256: ${fileSha256.slice(0, 12)})`);
    if (label) console.log(` 処理       : ${label}`);
    console.log('========================================================');
  };
  const stateLabel = (no) => {
    const { state, last } = states.get(no);
    if (state === 'pending') return '未適用';
    const by = `${formatDate(last.applied_at)} ${last.applied_by ?? ''}${last.status === 'marked' ? '（記録のみ）' : ''}`;
    return state === 'applied' ? `適用済み ${by}` : `適用済み・その後に内容変更あり ${by}`;
  };

  // --- 適用状況の表示 ---
  if (opts.status) {
    printHeader('適用状況の確認');
    for (const s of sections) {
      console.log(`  [${s.no}] ${stateLabel(s.no).padEnd(8)}  ${s.title}`);
      for (const command of s.posts) {
        const runs = history.filter((h) => h.step_type === 'post' && h.section_no === s.no && h.command === command);
        const last = runs[runs.length - 1];
        console.log(`        @post: ${command}  → ${last ? `${last.status} ${formatDate(last.applied_at)}` : '未実行'}`);
      }
    }
    return;
  }

  // --- 対象セクションの決定 ---
  const isMark = Boolean(opts.markApplied);
  let targetNos;
  if (isMark) {
    targetNos = parseSectionNos(opts.markApplied, sections);
  } else if (opts.sections === 'pending') {
    targetNos = sections.filter((s) => states.get(s.no).state === 'pending').map((s) => s.no);
    if (targetNos.length === 0) {
      console.log('\n未適用のセクションはありません。');
      return;
    }
  } else if (opts.sections) {
    targetNos = parseSectionNos(opts.sections, sections);
  } else if (sections.length === 1) {
    targetNos = [1];
  } else {
    fail(`このファイルには ${sections.length} 個のセクションがあります。--status で適用状況を確認し、--sections=pending / all / <番号> を指定してください。`);
  }
  const targets = sections.filter((s) => targetNos.includes(s.no));

  const alreadyApplied = targets.filter((s) => states.get(s.no).state !== 'pending');
  if (alreadyApplied.length > 0 && !opts.reapply) {
    fail(`適用済みのセクションが含まれています: ${alreadyApplied.map((s) => `[${s.no}]`).join(' ')}\n` +
      '  --status で確認してください。冪等なセクションを意図的に再実行する場合のみ --reapply を付けてください。');
  }

  // --- 実行計画の表示と確認 ---
  const postCount = isMark || opts.skipPost ? 0 : targets.reduce((n, s) => n + s.posts.length, 0);
  printHeader(isMark
    ? '適用済みとして記録のみ（SQLは実行しません）'
    : `セクション ${targets.length} / ${sections.length} を適用、適用後作業 ${postCount}件${opts.skipPost ? '（--skip-post）' : ''}`);
  for (const s of targets) {
    console.log(`  [${s.no}] ${s.title}  （現在: ${stateLabel(s.no)}）`);
    if (!isMark && !opts.skipPost) s.posts.forEach((p) => console.log(`        @post: ${p}`));
  }

  if (opts.env === 'prod') {
    const typed = await ask(`\n本番環境です。実行する場合はプロジェクトのReference ID（${ref}）を入力してください: `);
    if (typed !== ref) fail('Reference ID が一致しないため中止しました。');
  } else {
    const yes = await ask('\n実行しますか？ (y/N): ');
    if (yes.toLowerCase() !== 'y') fail('キャンセルしました。');
  }

  const gitUser = git('config user.name');
  const gitCommit = git('rev-parse --short HEAD');
  const log = {
    startedAt: new Date().toISOString(),
    env: opts.env,
    projectRef: ref,
    projectName: project.name,
    file: path.relative(REPO_ROOT, sqlPath),
    sha256: fileSha256,
    mode: isMark ? 'mark-applied' : 'apply',
    gitUser,
    gitBranch: git('rev-parse --abbrev-ref HEAD'),
    gitCommit,
    steps: [],
    result: 'aborted',
  };
  const record = (section, stepType, status, extra = {}) => historyInsertSql({
    file: fileName, section, stepType, status, appliedBy: gitUser, gitCommit, ...extra,
  });

  // Ctrl+C等で中断した場合もログを残す
  process.on('SIGINT', () => {
    console.log(`\n中断しました。ログ: ${writeLog(log)}`);
    process.exit(130);
  });

  // 適用後スクリプトに渡す環境変数（既存スクリプトは NEXT_PUBLIC_SUPABASE_URL を参照するため両方渡す）
  const postEnv = {
    ...process.env,
    SUPABASE_URL: envVars.SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_URL: envVars.SUPABASE_URL ?? '',
    SUPABASE_SERVICE_ROLE_KEY: envVars.SUPABASE_SERVICE_ROLE_KEY ?? '',
  };

  try {
    // 適用履歴テーブルの作成（冪等）
    await query(readFileSync(HISTORY_DDL, 'utf8'));

    if (isMark) {
      await query(targets.map((s) => record(s, 'sql', 'marked', { note: 'run.mjs 導入前などに適用済みのため記録のみ' })).join('\n'));
      targets.forEach((s) => log.steps.push({ type: 'sql', section: s.no, title: s.title, status: 'marked' }));
      console.log(`\n${targets.length}件のセクションを適用済みとして記録しました。`);
      log.result = 'success';
      return;
    }

    for (const section of targets) {
      process.stdout.write(`\n[${section.no}] ${section.title} ... `);
      const started = Date.now();
      try {
        // セクション（BEGIN〜COMMIT）の直後に履歴を記録する。セクションでエラーになった場合は
        // 同じリクエスト内の後続（履歴INSERT）も実行されない。
        await query(`${section.sql}\n\n${record(section, 'sql', 'applied')}`);
      } catch (e) {
        console.log('NG');
        log.steps.push({ type: 'sql', section: section.no, title: section.title, status: 'failed', error: e.message });
        await query(record(section, 'sql', 'failed', { note: e.message.slice(0, 1000) })).catch(() => {});
        throw new Error(`セクション${section.no}でエラーが発生しました（このセクションはロールバックされ、以降は未実行です）\n${e.message}`);
      }
      console.log(`OK (${Date.now() - started}ms)`);
      log.steps.push({ type: 'sql', section: section.no, title: section.title, status: 'applied' });

      if (opts.skipPost) continue;
      for (const command of section.posts) {
        if (!envVars.SUPABASE_URL || !envVars.SUPABASE_SERVICE_ROLE_KEY) {
          throw new Error('適用後作業には SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です（--skip-post で省略可）。');
        }
        const answer = await ask(`\n  @post: ${command}\n  実行しますか？ (y=実行 / s=スキップ / N=中止): `);
        if (answer.toLowerCase() === 's') {
          log.steps.push({ type: 'post', section: section.no, command, status: 'skipped' });
          await query(record(section, 'post', 'skipped', { command }));
          continue;
        }
        if (answer.toLowerCase() !== 'y') throw new Error('適用後作業の実行前に中止しました。');

        const { status: exitCode } = spawnSync(command, { cwd: REPO_ROOT, env: postEnv, stdio: 'inherit', shell: true });
        const ok = exitCode === 0;
        log.steps.push({ type: 'post', section: section.no, command, status: ok ? 'applied' : 'failed', exitCode });
        await query(record(section, 'post', ok ? 'applied' : 'failed', { command, note: ok ? null : `exit code ${exitCode}` }));
        if (!ok) throw new Error(`適用後作業が失敗しました（終了コード ${exitCode}）: ${command}`);
      }
    }
    log.result = 'success';
    console.log('\nすべての処理が完了しました。');
  } catch (e) {
    log.result = 'failed';
    console.error(`\n[失敗] ${e.message}`);
    process.exitCode = 1;
  } finally {
    log.finishedAt = new Date().toISOString();
    console.log(`ログ: ${writeLog(log)}`);
  }
}

main().finally(() => lineReader.stop());
