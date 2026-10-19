import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 規約の文書が手本・正本として挙げるファイルが実在するかを検査する。
 * ファイルを消す・名前を変えたときに文書が古いまま残り、存在しない手本を読ませるのを防ぐ。
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const RULE_DOCS = [
  'CLAUDE.md',
  ...readdirSync(path.join(REPO_ROOT, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `docs/${name}`),
  ...readdirSync(path.join(REPO_ROOT, 'testing'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `testing/${name}`),
  'testing/unit/README.md',
  'testing/e2e/CONVENTIONS.md',
  'supabase/DDL/README.md',
  'scripts/vercel-env/README.md',
];

/** 実在しなくてよい名前と理由 */
const ALLOWED_MISSING: Record<string, string> = {
  'constants/dictionary.ts': '文言を分ける場合の置き場所の例（CLAUDE.md 5章）',
  'error-context.md': 'Playwright が失敗時に作るファイル',
};

const FILE_EXT = /\.(ts|tsx|mjs|cjs|js|md|json|css|yml|yaml|sql)$/;
/** 名前の型を示す書き方（`xxxAction.ts`・`<table>.sql`・`*.test.ts` 等）は実在のファイルではない */
const PLACEHOLDER = /[*<>{}]|xxx|Xxx|YYYY/;

const trackedFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .split('\n')
  .filter(Boolean);

/** アプリ・パッケージの中からの相対の書き方（`components/shell/PageFrames.tsx` 等）も、どこかのファイルの末尾に一致すればよい */
function existsAnywhere(ref: string, docDir: string): boolean {
  if (existsSync(path.join(REPO_ROOT, ref)) || existsSync(path.join(REPO_ROOT, docDir, ref))) return true;
  const suffix = ref.replace(/^\.?\//, '');
  return trackedFiles.some((file) => file === suffix || file.endsWith(`/${suffix}`));
}

function referencedPaths(doc: string): string[] {
  const text = readFileSync(path.join(REPO_ROOT, doc), 'utf8');
  const inCode = [...text.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]);
  const inLinks = [...text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)]
    .map((m) => m[1])
    .filter((link) => !/^[a-z]+:/i.test(link));
  return [...new Set([...inCode, ...inLinks])].filter(
    (ref) => FILE_EXT.test(ref) && !PLACEHOLDER.test(ref) && !/^\.\w+$/.test(path.basename(ref)),
  );
}

test('規約の文書が挙げるファイルは実在する', () => {
  const missing = RULE_DOCS.flatMap((doc) =>
    referencedPaths(doc)
      .filter((ref) => !(ref in ALLOWED_MISSING) && !existsAnywhere(ref, path.dirname(doc)))
      .map((ref) => `${doc}: ${ref}`),
  );
  assert.deepEqual(missing, [], '消えた・名前の変わったファイルを挙げています。文書を今のファイルに合わせてください');
});
