// scripts/vercel-env/run.mjs
//
// アプリ（admin / student / coach）の環境変数を Vercel に反映するツール。
// 変数の定義は manifest.mjs、接続先は environments.mjs（いずれも Git 管理）、
// 値（秘密の値など）は values/.env.<env>（Git 管理外）に置き、差分を確認してから反映する。
// 運用手順は同ディレクトリの README.md を参照。
//
// 使い方（リポジトリ直下で実行）:
//   node scripts/vercel-env/run.mjs --env=staging --init       値ファイルを作成・不足分を追記（秘密の値の自動作成を含む）
//   node scripts/vercel-env/run.mjs --env=staging --pull       Vercel の現在の値から値ファイルを作る（初回の移行用）
//   node scripts/vercel-env/run.mjs --env=staging --check      値ファイルの検証のみ（Vercel に接続しない。dev は apps/*/.env.local を検証）
//   node scripts/vercel-env/run.mjs --env=staging              差分の表示のみ（--plan と同じ）
//   node scripts/vercel-env/run.mjs --env=staging --apply      差分を表示し、確認のうえ反映
//   node scripts/vercel-env/run.mjs --env=staging --write-app-env  apps/*/.env.staging（テスト等が読む控え）を作り直す
//   node scripts/vercel-env/run.mjs --write-examples           apps/*/.env.example を作り直す
//
// オプション:
//   --apps=admin,coach   対象のアプリを絞る
//   --prune              定義に無い変数（管理対象外）も削除する
//   --force              --pull で既存の値ファイルを上書きする

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { APPS, ENVIRONMENTS, VERCEL_TEAM_ID } from './environments.mjs';
import { MANIFEST, LOCAL, UNSET, SYSTEM_KEY_PATTERN } from './manifest.mjs';
import {
  buildAppEnvFile, buildExampleFile, buildValuesFile, diffProject, displayValue, isLocalSpec,
  normalizeTargets, resolveDesired, sha256, specFor, validateValue,
} from './lib.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TOOL_DIR, '../..');
const VALUES_DIR = path.join(TOOL_DIR, 'values');
const LOG_DIR = path.join(TOOL_DIR, 'logs');
const API = 'https://api.vercel.com';

// ---------------------------------------------------------------------------
// 引数・入力
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { env: undefined, mode: 'plan', apps: [...APPS], prune: false, force: false };
  const modes = { '--init': 'init', '--pull': 'pull', '--check': 'check', '--plan': 'plan', '--apply': 'apply',
    '--write-app-env': 'write-app-env', '--write-examples': 'write-examples' };
  let modeCount = 0;
  for (const arg of argv) {
    if (arg.startsWith('--env=')) opts.env = arg.slice('--env='.length);
    else if (arg.startsWith('--apps=')) opts.apps = arg.slice('--apps='.length).split(',').map((s) => s.trim());
    else if (arg === '--prune') opts.prune = true;
    else if (arg === '--force') opts.force = true;
    else if (modes[arg]) { opts.mode = modes[arg]; modeCount += 1; }
    else fail(`不明なオプションです: ${arg}`);
  }
  if (modeCount > 1) fail('--init / --pull / --check / --plan / --apply / --write-* は1つだけ指定してください。');
  for (const app of opts.apps) if (!APPS.includes(app)) fail(`--apps には ${APPS.join(' / ')} を指定してください。`);
  if (opts.mode === 'write-examples') return opts;
  if (!ENVIRONMENTS[opts.env]) fail(`--env には ${Object.keys(ENVIRONMENTS).join(' / ')} のいずれかを指定してください。`);
  if (opts.env === 'dev' && opts.mode !== 'check') fail('dev は Vercel に反映しません。--check（apps/*/.env.local の検証）だけ使えます。');
  if (opts.mode === 'write-app-env' && opts.env !== 'staging') fail('--write-app-env は staging だけで使えます（本番の秘密の値をアプリのフォルダに置かないため）。');
  return opts;
}

function fail(message) {
  console.error(`\n[中止] ${message}`);
  process.exit(1);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

/** 入力内容を表示しない入力（トークン用） */
function askSecret(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.on('close', () => resolve(''));
    rl.question(question, (answer) => {
      resolve(answer.trim());
      process.stdout.write('\n');
      rl.close();
    });
  });
}

// ---------------------------------------------------------------------------
// ファイル
// ---------------------------------------------------------------------------
const valuesPath = (env) => path.join(VALUES_DIR, `.env.${env}`);
const statePath = (env) => path.join(VALUES_DIR, `.state.${env}.json`);
const rel = (p) => path.relative(REPO_ROOT, p).replaceAll('\\', '/');

function readEnvFile(file) {
  if (!existsSync(file)) return undefined;
  return parseEnv(readFileSync(file, 'utf8'));
}

function loadValues(env) {
  const values = readEnvFile(valuesPath(env));
  if (!values) fail(`${rel(valuesPath(env))} がありません。--init（新規）または --pull（Vercel から取り込み）で作成してください。`);
  return values;
}

function writeValues(env, values, notes) {
  mkdirSync(VALUES_DIR, { recursive: true });
  writeFileSync(valuesPath(env), buildValuesFile({ env, label: ENVIRONMENTS[env].label, values, notes }), 'utf8');
}

/** Sensitive の変数は Vercel から読み出せないため、反映した値のハッシュを手元に残して比較に使う */
function loadState(env) {
  if (!existsSync(statePath(env))) return {};
  return JSON.parse(readFileSync(statePath(env), 'utf8'));
}

function saveState(env, state) {
  mkdirSync(VALUES_DIR, { recursive: true });
  writeFileSync(statePath(env), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function writeLog(env, entries) {
  mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(LOG_DIR, `${stamp}_${env}_vercel-env.json`);
  writeFileSync(file, `${JSON.stringify({ env, at: new Date().toISOString(), entries }, null, 2)}\n`, 'utf8');
  return file;
}

function printErrors(title, errors) {
  console.error(`\n${title}`);
  for (const e of errors) console.error(`  - ${e}`);
}

// ---------------------------------------------------------------------------
// Vercel API
// ---------------------------------------------------------------------------
function createClient(token) {
  async function call(method, pathname, body) {
    const url = `${API}${pathname}${pathname.includes('?') ? '&' : '?'}teamId=${VERCEL_TEAM_ID}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const message = json?.error?.message ?? text;
      const error = new Error(`${method} ${pathname} → ${res.status} ${message}`);
      error.status = res.status;
      throw error;
    }
    return json;
  }
  return {
    getProject: (name) => call('GET', `/v9/projects/${encodeURIComponent(name)}`),
    listEnv: async (projectId) => (await call('GET', `/v10/projects/${projectId}/env`)).envs ?? [],
    /** 暗号化された値を読み出す（Sensitive は読み出せない） */
    readEnv: (projectId, id) => call('GET', `/v1/projects/${projectId}/env/${id}`),
    createEnv: (projectId, body) => call('POST', `/v10/projects/${projectId}/env`, body),
    updateEnv: (projectId, id, body) => call('PATCH', `/v9/projects/${projectId}/env/${id}`, body),
    deleteEnv: (projectId, id) => call('DELETE', `/v9/projects/${projectId}/env/${id}`),
  };
}

async function getToken(env, values) {
  const token = values?.VERCEL_TOKEN || process.env.VERCEL_TOKEN;
  if (token) return token;
  const input = await askSecret(`Vercel のアクセストークン（${ENVIRONMENTS[env].label}）: `);
  if (!input) fail('アクセストークンが入力されませんでした。');
  return input;
}

/** プロジェクトの、対象の Environment に関係する変数を読み込む（読み出せる値は復号する） */
async function loadProject(client, app, target) {
  let project;
  try {
    project = await client.getProject(target.project);
  } catch (error) {
    if (error.status === 404) fail(`Vercel のプロジェクト ${target.project}（${app}）が見つかりません。environments.mjs を確認してください。`);
    if (error.status === 401 || error.status === 403) fail(`Vercel のアクセストークンが無効か、権限がありません（${error.message}）。`);
    throw error;
  }
  const all = await client.listEnv(project.id);
  const records = [];
  for (const r of all) {
    const t = normalizeTargets(r.target);
    const integration = r.configurationId ?? undefined;
    const relevant = t.some((x) => target.targets.includes(x)) && !SYSTEM_KEY_PATTERN.test(r.key) && !integration;
    let value;
    if (relevant && r.type !== 'sensitive' && r.type !== 'system' && !r.gitBranch) {
      const detail = await client.readEnv(project.id, r.id);
      value = detail.value;
    }
    records.push({ id: r.id, key: r.key, type: r.type, target: t, gitBranch: r.gitBranch, integration, value });
  }
  return { project, records };
}

// ---------------------------------------------------------------------------
// --write-examples
// ---------------------------------------------------------------------------
function writeExamples() {
  for (const app of APPS) {
    const file = path.join(REPO_ROOT, 'apps', app, '.env.example');
    writeFileSync(file, buildExampleFile(app), 'utf8');
    console.log(`作成: ${rel(file)}`);
  }
}

// ---------------------------------------------------------------------------
// --init
// ---------------------------------------------------------------------------
function init(env) {
  const values = readEnvFile(valuesPath(env)) ?? {};
  const generated = [];
  for (const def of MANIFEST) {
    if (def.removed || !def.generate || specFor(def, env) !== LOCAL) continue;
    if (!values[def.key]) {
      values[def.key] = randomBytes(32).toString('base64url');
      generated.push(def.key);
    }
  }
  writeValues(env, values);
  console.log(`作成・更新: ${rel(valuesPath(env))}`);
  if (generated.length > 0) console.log(`ランダムな値を作成: ${generated.join(', ')}`);
  const missing = MANIFEST.filter((d) => !d.removed && specFor(d, env) === LOCAL && !values[d.key]).map((d) => d.key);
  if (missing.length > 0) console.log(`\n値を記入してください（必須）:\n  ${missing.join('\n  ')}`);
  else console.log('\n必須の値はすべて記入済みです。次は --check と、差分の確認（--plan）を行ってください。');
}

// ---------------------------------------------------------------------------
// --check
// ---------------------------------------------------------------------------
function check(env) {
  if (env === 'dev') return checkDev();
  const config = ENVIRONMENTS[env];
  const { errors } = resolveDesired({ env, config, values: loadValues(env) });
  if (errors.length > 0) {
    printErrors(`${rel(valuesPath(env))} に問題があります:`, errors);
    process.exit(1);
  }
  console.log(`${rel(valuesPath(env))}: 問題ありません。`);
}

/** dev: 各アプリの .env.local が定義どおりかを確かめる（手元の開発環境のため、値の違いは警告だけ） */
function checkDev() {
  const config = ENVIRONMENTS.dev;
  let hasError = false;
  for (const app of APPS) {
    const file = path.join(REPO_ROOT, 'apps', app, '.env.local');
    const local = readEnvFile(file);
    if (!local) { console.log(`\n== ${app}: ${rel(file)} がありません`); hasError = true; continue; }
    const errors = [];
    const warnings = [];
    for (const def of MANIFEST.filter((d) => !d.removed && d.apps.includes(app))) {
      const spec = specFor(def, 'dev');
      const value = local[def.key] || undefined;
      if (spec === LOCAL && value === undefined) errors.push(`${def.key}: ありません（${def.description}）`);
      else if (spec === UNSET && value !== undefined) warnings.push(`${def.key}: dev では設定しない変数です`);
      else if (typeof spec === 'function' || (!isLocalSpec(spec) && spec !== UNSET)) {
        const expected = typeof spec === 'function' ? spec({ env: 'dev', app, config }) : spec;
        if (value !== expected) warnings.push(`${def.key}: ${displayValue(def, value ?? '（なし）')}（定義では ${displayValue(def, expected)}）`);
      }
      if (value !== undefined) {
        const problem = validateValue(def, value, { supabaseRef: config.supabaseRef });
        if (problem) errors.push(`${def.key}: ${problem}`);
      }
    }
    const known = new Set(MANIFEST.filter((d) => d.apps.includes(app)).map((d) => d.key));
    for (const key of Object.keys(local)) {
      if (!known.has(key) && !SYSTEM_KEY_PATTERN.test(key)) warnings.push(`${key}: ${app} の定義に無い変数です`);
    }
    console.log(`\n== ${app}（${rel(file)}）`);
    if (errors.length === 0 && warnings.length === 0) console.log('  問題ありません。');
    for (const e of errors) console.log(`  [エラー] ${e}`);
    for (const w of warnings) console.log(`  [確認]   ${w}`);
    if (errors.length > 0) hasError = true;
  }
  if (hasError) process.exit(1);
}

// ---------------------------------------------------------------------------
// --write-app-env
// ---------------------------------------------------------------------------
function writeAppEnv(env, apps) {
  const { desired, errors } = resolveDesired({ env, config: ENVIRONMENTS[env], values: loadValues(env) });
  if (errors.length > 0) { printErrors('値ファイルに問題があります:', errors); process.exit(1); }
  for (const app of apps) {
    const file = path.join(REPO_ROOT, 'apps', app, `.env.${env}`);
    writeFileSync(file, buildAppEnvFile({ app, env, desired: desired[app] }), 'utf8');
    console.log(`作成: ${rel(file)}`);
  }
}

// ---------------------------------------------------------------------------
// --pull
// ---------------------------------------------------------------------------
async function pull(env, opts) {
  const config = ENVIRONMENTS[env];
  const existing = readEnvFile(valuesPath(env));
  if (existing && !opts.force) fail(`${rel(valuesPath(env))} は既にあります。上書きする場合は --force を付けてください。`);
  const client = createClient(await getToken(env, existing));

  /** key → app → 値（読み出せない場合は null） */
  const found = new Map();
  const unmanaged = [];
  for (const app of APPS) {
    const target = config.vercel[app];
    const { records } = await loadProject(client, app, target);
    for (const r of records) {
      if (SYSTEM_KEY_PATTERN.test(r.key) || r.gitBranch || r.integration) continue;
      if (!r.target.some((t) => target.targets.includes(t))) continue;
      if (!MANIFEST.some((d) => d.key === r.key)) unmanaged.push(`${app}: ${r.key}`);
      const perApp = found.get(r.key) ?? new Map();
      perApp.set(app, r.value ?? null);
      found.set(r.key, perApp);
    }
  }

  // Sensitive で読み出せない値は、staging だけ手元の控え（apps/*/.env.staging）から補う
  const appFiles = env === 'staging'
    ? Object.fromEntries(APPS.map((a) => [a, readEnvFile(path.join(REPO_ROOT, 'apps', a, '.env.staging')) ?? {}]))
    : {};

  const values = { VERCEL_TOKEN: existing?.VERCEL_TOKEN ?? '' };
  const notes = {};
  const report = [];
  for (const def of MANIFEST) {
    if (def.removed || !isLocalSpec(specFor(def, env))) continue;
    const perApp = found.get(def.key);
    const candidates = new Map();
    for (const app of def.apps) {
      let v = perApp?.get(app);
      let from = 'Vercel';
      // 補うのは「Vercel にあるが読み出せない」値だけ（Vercel に無い値は補わない。控えにはテスト用の上書きがあるため）
      if (v === null) {
        const local = appFiles[app]?.[def.key];
        if (local) { v = local; from = `apps/${app}/.env.staging`; }
      }
      if (v) candidates.set(v, [...(candidates.get(v) ?? []), `${app}(${from})`]);
    }
    if (candidates.size === 0) {
      if (perApp && [...perApp.values()].some((v) => v === null)) notes[def.key] = 'Vercel に Sensitive で登録されており読み出せません。値を確認して記入してください';
      report.push(`${def.key}: ${perApp ? '読み出せないため空欄' : 'Vercel に無いため空欄'}`);
      continue;
    }
    values[def.key] = [...candidates.keys()][0];
    if (candidates.size > 1) {
      const detail = [...candidates.values()].map((apps) => apps.join('・')).join(' / ');
      notes[def.key] = `アプリごとに値が異なります（${detail}）。先頭の値を入れました。正しい値か確認してください`;
      report.push(`${def.key}: アプリごとに値が異なる（${detail}）`);
    }
  }
  writeValues(env, values, notes);
  console.log(`作成: ${rel(valuesPath(env))}（値は表示しません）`);
  if (report.length > 0) printErrors('確認が必要な変数:', report);
  if (unmanaged.length > 0) printErrors('定義（manifest.mjs）に無い変数（定義に追加するか、--prune で削除）:', unmanaged);
  console.log('\n次に --check で値ファイルを確かめ、--plan で Vercel との差分を確認してください。');
}

// ---------------------------------------------------------------------------
// --plan / --apply
// ---------------------------------------------------------------------------
const ACTION_LABEL = {
  add: '+ 追加', update: '~ 変更', recreate: '~ 作り直し', delete: '- 削除', unmanaged: '? 管理外',
};
const REASON_LABEL = {
  unset: 'この環境では設定しない定義', 'not-for-app': 'このアプリでは使わない定義', removed: '廃止した変数', unmanaged: '定義に無い変数',
};

function describeChange(c) {
  switch (c.action) {
    case 'add':
      return displayValue(c.def, c.value);
    case 'update':
      return c.unknown
        ? `（読み出せないため上書き）→ ${displayValue(c.def, c.value)}`
        : `${displayValue(c.def, c.before)} → ${displayValue(c.def, c.value)}`;
    case 'recreate':
      return `型 ${c.from} → ${c.type}（削除して登録し直す）: ${displayValue(c.def, c.value)}`;
    default: {
      const base = REASON_LABEL[c.reason];
      return c.remaining.length > 0 ? `${base}（${c.remaining.join(', ')} には残す）` : base;
    }
  }
}

async function plan(env, opts) {
  const config = ENVIRONMENTS[env];
  const values = loadValues(env);
  const { desired, errors } = resolveDesired({ env, config, values });
  if (errors.length > 0) {
    printErrors(`${rel(valuesPath(env))} に問題があります（反映できません）:`, errors);
    // 差分の表示は読み取りだけのため続ける（問題のある変数は差分に出ない・削除として出ることがある）
    if (opts.mode === 'apply') process.exit(1);
  }
  const client = createClient(await getToken(env, values));
  const state = loadState(env);
  const known = new Map(MANIFEST.map((d) => [d.key, d]));

  console.log(`\n環境: ${config.label}`);
  const projects = [];
  for (const app of opts.apps) {
    const target = config.vercel[app];
    const { project, records } = await loadProject(client, app, target);
    const { changes, warnings } = diffProject({
      desired: desired[app], records, targets: target.targets, known, stateHashes: state[project.name] ?? {},
    });
    const active = changes.filter((c) => c.action !== 'unmanaged' || opts.prune);
    const unchanged = [...desired[app].values()].filter((d) => d.value !== undefined).length
      - changes.filter((c) => ['add', 'update', 'recreate'].includes(c.action)).length;

    console.log(`\n== ${app} → ${project.name}（${target.targets.join(', ')}）`);
    for (const c of changes) {
      const label = c.action === 'unmanaged' && opts.prune ? '- 削除' : ACTION_LABEL[c.action];
      console.log(`  ${label.padEnd(8, '　')} ${c.key.padEnd(42)} ${describeChange(c)}`);
      if (c.shared && c.action !== 'delete') console.log(`  ${''.padEnd(8, '　')} ${''.padEnd(42)} ※ ${c.shared.join(', ')} にも同じ値が反映されます`);
    }
    console.log(`  変更なし ${unchanged}件`);
    for (const w of warnings) console.log(`  [確認] ${w}`);
    projects.push({ app, project, changes: active, target });
  }

  const total = projects.reduce((n, p) => n + p.changes.length, 0);
  const notes = projects.flatMap((p) => p.changes)
    .filter((c) => ['add', 'update', 'recreate'].includes(c.action) && c.def?.note)
    .map((c) => `${c.key}: ${c.def.note}`);
  if (total === 0) {
    console.log('\n差分はありません。');
    return;
  }
  if (notes.length > 0) printErrors('反映後に必要な作業:', [...new Set(notes)]);
  if (opts.mode !== 'apply') {
    console.log(`\n${total}件の差分があります。反映する場合は --apply を付けて実行してください。`);
    return;
  }

  if (config.confirmWord) {
    const typed = await ask(`\n${config.label}に ${total}件を反映します。確認のため "${config.confirmWord}" と入力してください: `);
    if (typed !== config.confirmWord) fail('入力が一致しないため中止しました。');
  } else {
    const answer = await ask(`\n${config.label}に ${total}件を反映しますか？ (y/N): `);
    if (answer.toLowerCase() !== 'y') fail('中止しました。');
  }
  await apply(env, client, projects, state);
}

async function apply(env, client, projects, state) {
  const log = [];
  const rememberHash = (projectName, key, value, type) => {
    state[projectName] ??= {};
    if (type === 'sensitive') state[projectName][key] = sha256(value);
    else delete state[projectName][key];
    saveState(env, state);
  };
  const forgetHash = (projectName, key) => {
    if (state[projectName]) delete state[projectName][key];
    saveState(env, state);
  };

  try {
    for (const { app, project, changes } of projects) {
      // 追加・変更を先に、削除を後に行う
      const ordered = [...changes].sort((a, b) => Number(a.action === 'delete' || a.action === 'unmanaged') - Number(b.action === 'delete' || b.action === 'unmanaged'));
      for (const c of ordered) {
        const entry = { app, project: project.name, key: c.key, action: c.action };
        log.push(entry);
        process.stdout.write(`  ${app}: ${ACTION_LABEL[c.action] ?? c.action} ${c.key} ... `);
        if (c.action === 'add') {
          await client.createEnv(project.id, { key: c.key, value: c.value, type: c.type, target: c.targets });
          rememberHash(project.name, c.key, c.value, c.type);
        } else if (c.action === 'update') {
          await client.updateEnv(project.id, c.record.id, { value: c.value, target: c.targets });
          rememberHash(project.name, c.key, c.value, c.type);
        } else if (c.action === 'recreate') {
          await client.deleteEnv(project.id, c.record.id);
          entry.deleted = true;
          await client.createEnv(project.id, { key: c.key, value: c.value, type: c.type, target: c.targets });
          rememberHash(project.name, c.key, c.value, c.type);
        } else if (c.remaining.length > 0) {
          await client.updateEnv(project.id, c.record.id, { target: c.remaining });
        } else {
          await client.deleteEnv(project.id, c.record.id);
          forgetHash(project.name, c.key);
        }
        entry.ok = true;
        console.log('OK');
      }
    }
  } catch (error) {
    console.log('失敗');
    const file = writeLog(env, log);
    fail(`${error.message}\n  ここまでの記録: ${rel(file)}\n  原因を直して同じコマンドを再実行すると、残りの差分だけを反映します。`);
  }
  const file = writeLog(env, log);
  console.log(`\nすべて反映しました（記録: ${rel(file)}）。`);
  const apps = [...new Set(log.map((e) => `${e.app}（${e.project}）`))];
  console.log(`環境変数は次のデプロイから使われます。再デプロイが必要なアプリ: ${apps.join('、')}`);
}

// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  switch (opts.mode) {
    case 'write-examples': return writeExamples();
    case 'init': return init(opts.env);
    case 'check': return check(opts.env);
    case 'write-app-env': return writeAppEnv(opts.env, opts.apps);
    case 'pull': return pull(opts.env, opts);
    default: return plan(opts.env, opts);
  }
}

main().catch((error) => fail(error.stack ?? String(error)));
