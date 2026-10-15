#!/usr/bin/env node
// リリース向け変更概要資料の材料（事実と数値）を集める。
// 使い方: node .claude/skills/release-summary/scripts/collect.mjs feature/20261004-dev [--base=<commit>] [--staging=origin/staging] [--out=<file>]
// - 対象範囲は「staging に入った対象ブランチのスカッシュコミットの親」..「origin/<branch>」。
//   見つからない場合（staging 未マージ等）は --base で起点のコミットを指定する。
// - 出力は Markdown（標準出力、または --out のファイル）。資料の本文はこの事実だけを根拠に書く。
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const branch = args.find((a) => !a.startsWith('--'));
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
if (!branch) {
  process.stderr.write('usage: collect.mjs <branch> [--base=<commit>] [--staging=origin/staging] [--out=<file>]\n');
  process.exit(1);
}

const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=off', ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trimEnd();
const tryGit = (...a) => {
  try {
    return git(...a);
  } catch {
    return '';
  }
};

const staging = opt('staging') ?? 'origin/staging';
const head = tryGit('rev-parse', '--verify', `origin/${branch}`) ? `origin/${branch}` : branch;
const dateToken = branch.match(/(\d{8})/)?.[1];

let mergeCommit = '';
let base = opt('base') ?? '';
if (!base && dateToken) {
  const line = tryGit('log', staging, '--format=%H%x09%s', '-200')
    .split('\n')
    .find((l) => l.split('\t')[1]?.includes(dateToken));
  if (line) {
    mergeCommit = line.split('\t')[0];
    base = `${mergeCommit}^`;
  }
}
if (!base) {
  process.stderr.write(`staging (${staging}) に ${branch} のマージが見つかりません。--base=<commit> を指定してください。\n`);
  process.exit(1);
}

const range = `${base}..${head}`;
const out = [];
const p = (s = '') => out.push(s);

// ---- コミット ----
const commits = tryGit('log', '--reverse', '--date=short', '--format=%ad%x09%h%x09%s', range)
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    const [date, hash, ...s] = l.split('\t');
    return { date, hash, subject: s.join('\t') };
  });
const dates = commits.map((c) => c.date).sort();

p(`# 変更概要の材料: ${branch}`);
p();
p(`- 範囲: \`${range}\`${mergeCommit ? `（staging のマージ: ${mergeCommit.slice(0, 8)} ${tryGit('log', '-1', '--format=%s', mergeCommit)}）` : ''}`);
p(`- コミット数: ${commits.length}`);
p(`- 期間: ${dates[0] ?? '-'} 〜 ${dates.at(-1) ?? '-'}`);
p(`- 差分: ${tryGit('diff', '--shortstat', base, head).trim()}`);
p();

// ---- 変更の多い領域 ----
const files = tryGit('diff', '--name-status', base, head)
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    const [status, ...rest] = l.split('\t');
    return { status: status[0], path: rest.at(-1) };
  });
const areaOf = (path) => {
  const seg = path.split('/');
  if (seg[0] === 'apps' || seg[0] === 'packages') return `${seg[0]}/${seg[1]}`;
  if (seg[0] === 'testing') return `testing/${seg[1]}`;
  return seg[0];
};
const areas = new Map();
for (const f of files) areas.set(areaOf(f.path), (areas.get(areaOf(f.path)) ?? 0) + 1);
p('## 領域ごとの変更ファイル数');
p();
for (const [area, n] of [...areas].sort((a, b) => b[1] - a[1])) p(`- ${area}: ${n}`);
p();

// ---- 品質（テスト・仕様書） ----
const countTests = (rev) =>
  tryGit('grep', '-cE', '^\\s*test(\\.(skip|fixme))?\\(', rev, '--', 'testing/e2e/**/*.spec.ts')
    .split('\n')
    .filter(Boolean)
    .reduce((sum, l) => sum + Number(l.split(':').at(-1)), 0);
const e2eBefore = countTests(base);
const e2eAfter = countTests(head);
const byStatus = (pred) => {
  const hit = files.filter((f) => pred(f.path));
  return {
    added: hit.filter((f) => f.status === 'A').map((f) => f.path),
    modified: hit.filter((f) => f.status === 'M').map((f) => f.path),
  };
};
const e2eFiles = byStatus((x) => x.startsWith('testing/e2e/') && x.endsWith('.spec.ts'));
const unit = byStatus((x) => x.endsWith('.test.ts'));
const screens = byStatus((x) => x.startsWith('docs/screens/') && x.endsWith('.md') && !x.endsWith('_INDEX.md'));
const e2eSpecs = byStatus((x) => x.startsWith('testing/e2e/specs/') && x.endsWith('.md') && !x.endsWith('_INDEX.md'));
const otherDocs = byStatus((x) => x.startsWith('docs/') && !x.startsWith('docs/screens/') && x.endsWith('.md'));

p('## 品質（テスト・仕様書）');
p();
p(`- ブラウザ自動テスト（Playwright の test 数）: ${e2eBefore} → ${e2eAfter}（${e2eAfter - e2eBefore >= 0 ? '+' : ''}${e2eAfter - e2eBefore}）`);
p(`  - 追加したテストファイル: ${e2eFiles.added.length} / 変更: ${e2eFiles.modified.length}`);
for (const f of e2eFiles.added) p(`    - A ${f}`);
p(`- 単体テストのファイル: 追加 ${unit.added.length} / 変更 ${unit.modified.length}`);
p(`- 画面仕様書（docs/screens）: 追加 ${screens.added.length} / 更新 ${screens.modified.length}`);
for (const f of screens.added) p(`    - A ${f}`);
p(`- 機能仕様書（testing/e2e/specs）: 追加 ${e2eSpecs.added.length} / 更新 ${e2eSpecs.modified.length}`);
for (const f of e2eSpecs.added) p(`    - A ${f}`);
p(`- その他の文書（docs/）: 追加 ${otherDocs.added.length} / 更新 ${otherDocs.modified.length}`);
for (const f of otherDocs.added) p(`    - A ${f}`);
p();

// ---- DB（リリーススクリプト） ----
const releaseFiles = tryGit('ls-tree', '--name-only', head, 'supabase/release/')
  .split('\n')
  .filter((x) => dateToken && x.includes(dateToken) && x.endsWith('.sql'));
const newTables = files.filter((f) => f.status === 'A' && f.path.startsWith('supabase/DDL/table/')).map((f) => f.path);
const newFunctions = files.filter((f) => f.status === 'A' && f.path.startsWith('supabase/DDL/function/')).map((f) => f.path);
p('## DB（リリーススクリプト）');
p();
p(`- 新規テーブル（DDL/table の追加）: ${newTables.length}`);
for (const t of newTables) p(`    - ${t.replace('supabase/DDL/table/', '')}`);
p(`- 新規関数（DDL/function の追加）: ${newFunctions.length}`);
for (const releaseFile of releaseFiles) {
  const sql = tryGit('show', `${head}:${releaseFile}`);
  const lines = sql.split('\n');
  const sections = lines.filter((l) => l.includes('【追加セクション】')).map((l) => l.replace(/^--\s*【追加セクション】/, '').trim());
  const headerEnd = lines.findIndex((l) => !l.startsWith('--') && l.trim() !== '');
  p(`- ${releaseFile}: 先頭の項目 + 追加セクション ${sections.length} = 計 ${sections.length + 1} 項目`);
  for (const s of sections) p(`    - ${s}`);
  p();
  p('### リリーススクリプト冒頭（作業手順・環境変数・注意）');
  p();
  p('```');
  p(lines.slice(0, headerEnd < 0 ? 120 : headerEnd).join('\n'));
  p('```');
  p();
  // 各セクションの【注意】（適用とデプロイの順番など）
  p('### 各セクションの【注意】');
  p();
  lines.forEach((l, i) => {
    if (!l.includes('【注意】')) return;
    const block = [l];
    for (let j = i + 1; j < lines.length && lines[j].startsWith('--   '); j++) block.push(lines[j]);
    p(block.map((b) => b.replace(/^--\s?/, '')).join(' ').replace(/\s+/g, ' '));
  });
}
p();

// ---- コミット一覧（本文つき） ----
p('## コミット一覧（古い順・本文つき）');
p();
for (const c of commits) {
  const body = tryGit('log', '-1', '--format=%b', c.hash)
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('Co-Authored-By'))
    .join('\n');
  p(`### ${c.date} ${c.hash} ${c.subject}`);
  if (body) p(body);
  p();
}

const text = out.join('\n') + '\n';
const outFile = opt('out');
if (outFile) {
  writeFileSync(outFile, text, 'utf8');
  process.stdout.write(`wrote ${outFile} (${commits.length} commits)\n`);
} else {
  process.stdout.write(text);
}
