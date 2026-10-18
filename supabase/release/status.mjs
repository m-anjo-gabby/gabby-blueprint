// supabase/release/status.mjs
//
// 環境ごとのリリース状況を1画面に出す（読み取りのみ）。
//   - DB: その環境のブランチにあるリリーススクリプト（新しい順）の適用状況（ops.release_history）
//   - アプリ: Vercel の本番デプロイ（READY）のコミットと、ブランチの最新との差
// 「DB だけ・アプリだけ反映されている」「デプロイ忘れ」をリリースの前後で見つけるために使う。
// 手順は docs/RELEASE.md。
//
// 使い方（リポジトリ直下で実行）:
//   pnpm release:status --env=staging
//   pnpm release:status --env=prod --files=5
//
// オプション:
//   --env=dev|staging|prod  対象の環境（dev はブランチを持たないため、手元のファイルと比べる）
//   --files=N               表示するリリーススクリプトの数（既定 3）
//
// トークン: Supabase は supabase/release/env/.env.<env> → 環境変数 SUPABASE_ACCESS_TOKEN → 入力。
//           Vercel は scripts/vercel-env/values/.env.<env> → 環境変数 VERCEL_TOKEN → 入力。

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { APPS, ENVIRONMENTS, VERCEL_TEAM_ID } from '../../scripts/vercel-env/environments.mjs';
import { ENVS, RELEASE_DIR, REPO_ROOT, connect } from './lib/connection.mjs';
import { askSecret } from './lib/prompt.mjs';
import { fetchHistory, sectionState, splitSections } from './lib/releaseFile.mjs';

/** 環境ごとのデプロイ元のブランチ（dev は開発ブランチを都度選ぶため無し） */
const BRANCH = { dev: undefined, staging: 'staging', prod: 'main' };
const RELEASE_FILE = /^\d{8}_.+\.sql$/;

function parseArgs(argv) {
  const opts = { env: undefined, files: 3 };
  for (const arg of argv) {
    if (arg.startsWith('--env=')) opts.env = arg.slice('--env='.length);
    else if (arg.startsWith('--files=')) opts.files = Number(arg.slice('--files='.length));
    else fail(`不明なオプションです: ${arg}`);
  }
  if (!ENVS.includes(opts.env)) fail(`--env には ${ENVS.join(' / ')} のいずれかを指定してください。`);
  if (!Number.isInteger(opts.files) || opts.files < 1) fail('--files には1以上の整数を指定してください。');
  return opts;
}

function fail(message) {
  console.error(`\n[中止] ${message}`);
  process.exit(1);
}

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** その環境のリリーススクリプト（新しい順）を { name, text } で返す。ブランチがある環境はブランチの中身を読む */
function releaseFiles(ref, limit) {
  const names = ref
    ? git(`ls-tree --name-only ${ref} supabase/release/`)
        .split('\n')
        .map((p) => path.basename(p))
    : readdirSync(RELEASE_DIR);
  return names
    .filter((n) => RELEASE_FILE.test(n))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((name) => ({
      name,
      text: ref ? git(`show ${ref}:supabase/release/${name}`) : readFileSync(path.join(RELEASE_DIR, name), 'utf8'),
    }));
}

function summarize(sections, history) {
  const states = sections.map((s) => sectionState(s, history).state);
  const count = (st) => states.filter((x) => x === st).length;
  const applied = count('applied');
  const changed = count('changed');
  const total = sections.length;
  if (changed > 0)
    return {
      ok: false,
      changedOnly: applied + changed === total,
      label: `適用後に内容変更あり ${changed}件（適用済み ${applied}/${total}）`,
    };
  if (applied === total) return { ok: true, label: `適用済み ${applied}/${total}` };
  if (applied === 0) return { ok: false, label: `未適用 0/${total}` };
  const pending = sections.filter((_, i) => states[i] === 'pending').map((s) => s.no);
  return { ok: false, label: `一部適用 ${applied}/${total}（未適用: ${pending.join(', ')}）` };
}

async function vercelToken(env) {
  const file = path.join(REPO_ROOT, `scripts/vercel-env/values/.env.${env}`);
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')).VERCEL_TOKEN : undefined;
  const token =
    fromFile ||
    process.env.VERCEL_TOKEN ||
    (await askSecret(`Vercel のアクセストークン（${ENVIRONMENTS[env].label}）: `));
  if (!token) fail('Vercel のアクセストークンが入力されませんでした。');
  return token;
}

async function latestDeployment(token, projectId) {
  const url = `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${VERCEL_TEAM_ID}&target=production&state=READY&limit=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${await res.text()}`);
  const [d] = (await res.json()).deployments;
  return (
    d && {
      sha: d.meta?.githubCommitSha ?? '',
      ref: d.meta?.githubCommitRef ?? '',
      by: d.meta?.githubDeployedBy ?? '',
      created: new Date(d.created),
    }
  );
}

const formatTime = (date) =>
  new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }).format(date);

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = ENVIRONMENTS[opts.env];
  const branch = BRANCH[opts.env];
  const problems = [];

  let ref;
  let tip;
  if (branch) {
    git(`fetch -q origin ${branch}`);
    ref = `origin/${branch}`;
    tip = git(`rev-parse ${ref}`);
  }

  const { project, query } = await connect(opts.env, askSecret).catch((e) => fail(e.message));
  const history = await fetchHistory(query).catch((e) => fail(`適用履歴の取得に失敗しました: ${e.message}`));

  console.log('\n========================================================');
  console.log(` 環境       : ${opts.env.toUpperCase()}（${project.name}）`);
  console.log(
    ` ブランチ   : ${ref ? `${ref} ${tip.slice(0, 8)} ${git(`log -1 --format=%s ${ref}`)}` : '（dev は手元のファイルと比べる）'}`,
  );
  console.log('========================================================');

  console.log(`\nDB のリリーススクリプト（新しい順に ${opts.files} 件）`);
  for (const file of releaseFiles(ref, opts.files)) {
    const result = summarize(
      splitSections(file.text),
      history.filter((h) => h.release_file === file.name),
    );
    // dev は開発中にセクションを書き換えるため、「適用後に内容変更あり」は表示だけにする
    const ok = result.ok || (opts.env === 'dev' && result.changedOnly);
    console.log(`  ${ok ? '✓' : '!'} ${file.name.padEnd(48)} ${result.label}`);
    if (!ok) problems.push(`DB: ${file.name} が ${result.label}`);
  }

  console.log('\nアプリ（Vercel の本番デプロイ）');
  const token = await vercelToken(opts.env);
  for (const app of APPS) {
    const target = config.vercel?.[app];
    if (!target) continue;
    const d = await latestDeployment(token, target.projectId).catch((e) => fail(`${target.project}: ${e.message}`));
    if (!d) {
      console.log(`  ! ${app.padEnd(8)} デプロイがありません`);
      problems.push(`アプリ: ${app} のデプロイがありません`);
      continue;
    }
    let note = d.ref;
    let ok = true;
    if (tip) {
      if (d.sha === tip) note = '最新';
      else {
        ok = false;
        let behind = '?';
        try {
          behind = git(`rev-list --count ${d.sha}..${tip}`);
        } catch {
          /* 手元に無いコミット */
        }
        note = `${branch} の最新ではない（未デプロイのコミット ${behind} 件）`;
        problems.push(`アプリ: ${app} が ${branch} の最新（${tip.slice(0, 8)}）ではない`);
      }
    }
    console.log(
      `  ${ok ? '✓' : '!'} ${app.padEnd(8)} ${d.sha.slice(0, 8)}  ${formatTime(d.created)}  ${d.by.padEnd(14)} ${note}`,
    );
  }

  if (problems.length === 0) {
    console.log('\n判定: DB・アプリとも反映済みです。');
  } else {
    console.log('\n判定: 確認が必要です。');
    problems.forEach((p) => console.log(`  - ${p}`));
    console.log('  （リリース作業の途中なら、docs/RELEASE.md の次の手順に進んでください）');
  }
}

main();
