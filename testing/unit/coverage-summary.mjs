// 単体テストのカバレッジの要約（CI の結果の画面に出す。手元では標準出力に出す）。
// Node のカバレッジはテストが読み込んだファイルしか数えないため、packages/lib の「画面・DB に依らない処理」の
// ファイルのうち、どのテストからも読み込まれていないものを別に挙げる（単体テストを足す候補。testing/unit/README.md）。
//
//   node unit/coverage-summary.mjs [lcov のパス]   （既定: unit/lcov.info）

import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIB_ROOT = path.join(REPO_ROOT, 'packages/lib');
const lcovPath = path.resolve(process.argv[2] ?? path.join(REPO_ROOT, 'testing/unit/lcov.info'));

// 単体テストの対象にしないもの（画面の部品・hooks・ストア・サーバーアクション・SDK の包み・DB の接続）
const EXCLUDED_DIRS = ['actions', 'hooks', 'components', 'stores', 'styles', 'supabase', 'zoom', 'node_modules'];

function listCandidates(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return EXCLUDED_DIRS.includes(entry.name) ? [] : listCandidates(full);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) return [];
    const source = readFileSync(full, 'utf8');
    // ブラウザ専用・サーバー専用（server-only は Next の外では読み込めない）のファイルは除く
    if (/^['"]use (client|server)['"]/m.test(source) || /import ['"]server-only['"]/.test(source)) return [];
    return [full];
  });
}

const normalize = (p) => path.resolve(p).toLowerCase();

const covered = new Map();
if (existsSync(lcovPath)) {
  let current = null;
  for (const line of readFileSync(lcovPath, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('SF:')) current = { file: line.slice(3), found: 0, hit: 0 };
    else if (line.startsWith('LF:') && current) current.found = Number(line.slice(3));
    else if (line.startsWith('LH:') && current) current.hit = Number(line.slice(3));
    else if (line === 'end_of_record' && current) {
      covered.set(normalize(current.file), current);
      current = null;
    }
  }
}

const candidates = listCandidates(LIB_ROOT);
const tested = candidates.filter((f) => covered.has(normalize(f)));
const untested = candidates.filter((f) => !covered.has(normalize(f)));
const lines = tested.reduce(
  (acc, f) => {
    const c = covered.get(normalize(f));
    return { found: acc.found + c.found, hit: acc.hit + c.hit };
  },
  { found: 0, hit: 0 },
);
const pct = (n, d) => (d === 0 ? '-' : `${((n / d) * 100).toFixed(1)}%`);

const byDir = new Map();
for (const f of candidates) {
  const dir = path.relative(LIB_ROOT, f).split(path.sep)[0].replace(/\.ts$/, '');
  const row = byDir.get(dir) ?? { total: 0, tested: 0 };
  row.total += 1;
  if (covered.has(normalize(f))) row.tested += 1;
  byDir.set(dir, row);
}

const out = [
  '## 単体テストのカバレッジ（packages/lib の画面・DB に依らない処理）',
  '',
  `- テストのあるファイル: ${tested.length} / ${candidates.length}（${pct(tested.length, candidates.length)}）`,
  `- テストのあるファイルの行のカバレッジ: ${pct(lines.hit, lines.found)}`,
  '',
  '| フォルダ | テストあり / 対象 |',
  '|---|---|',
  ...[...byDir.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, r]) => `| ${dir} | ${r.tested} / ${r.total} |`),
  '',
  `<details><summary>テストの無いファイル（${untested.length}件）</summary>`,
  '',
  ...untested.map((f) => `- ${path.relative(REPO_ROOT, f).split(path.sep).join('/')}`),
  '',
  '</details>',
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
else process.stdout.write(out);
