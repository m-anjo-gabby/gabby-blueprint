import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * testing/TEST-JUDGEMENT-GUIDE.md の「気づきの育て方」を機械的に保つ。事例（KJ）を消した時に参照元が残る、
 * 判断基準が消えた事例を指す、ファイルが育ちすぎて読まれなくなる、をここで止める。
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GUIDE = path.join(REPO_ROOT, 'testing/TEST-JUDGEMENT-GUIDE.md');
const MAX_LINES = 600;
const ROOTS = ['apps', 'packages', 'docs', 'testing', 'supabase', 'scripts', 'CLAUDE.md'];
/** 過去の出来事の記録（その時点の KJ 番号をそのまま残す。リリーススクリプトは適用済みの内容を変えない） */
const HISTORY_FILES = /([\\/]HISTORY\.md|[\\/]supabase[\\/]release[\\/][^\\/]+\.sql)$/;
const KJ = /KJ-\d{4}-\d{4}-\d{2}/g;

function listFiles(target: string): string[] {
  const full = path.join(REPO_ROOT, target);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.next', '.turbo', 'results', 'test-results', '.artifacts'].includes(entry.name)) return [];
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) return listFiles(child);
    return /\.(md|ts|tsx|mjs|sql)$/.test(entry.name) ? [path.join(REPO_ROOT, child)] : [];
  });
}

const guide = readFileSync(GUIDE, 'utf8');
const cases = new Set([...guide.matchAll(/^### (KJ-\d{4}-\d{4}-\d{2}) /gm)].map((m) => m[1]));
const criteria = guide.slice(guide.indexOf('## 1. 判断基準'), guide.indexOf('## 2. 事例'));

test('判断基準の章と事例の章がある', () => {
  assert.ok(criteria.length > 0, '「## 1. 判断基準」と「## 2. 事例」の見出しが必要です');
  assert.ok(cases.size > 0);
});

test('判断基準が指す KJ は事例にある', () => {
  const missing = [...new Set(criteria.match(KJ) ?? [])].filter((id) => !cases.has(id));
  assert.deepEqual(missing, []);
});

test('他のファイル・コードが参照する KJ は事例にある（消した時は参照元も直す）', () => {
  const dangling = ROOTS.flatMap(listFiles)
    .filter((file) => file !== GUIDE && !HISTORY_FILES.test(file))
    .flatMap((file) =>
      [...new Set(readFileSync(file, 'utf8').match(KJ) ?? [])]
        .filter((id) => !cases.has(id))
        .map((id) => `${path.relative(REPO_ROOT, file)}: ${id}`),
    );
  assert.deepEqual(dangling, []);
});

test(`ガイドは ${MAX_LINES} 行以内（超えたら全分類を棚卸しする）`, () => {
  const lines = guide.split('\n').length;
  assert.ok(lines <= MAX_LINES, `${lines} 行あります。「気づきの育て方」の片付けを行ってください`);
});
