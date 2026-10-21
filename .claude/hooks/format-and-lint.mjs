// Claude Code の PostToolUse フック（.claude/settings.json）。
// Claude が JS/TS のファイルを書いた・直した直後に、そのファイルだけ Prettier で整形し、ESLint（警告も失敗）で確かめる。
// ESLint の指摘は終了コード 2 と標準エラーで Claude に返し、その場で直させる（CLAUDE.md §3 の完了条件の一部）。
// 型の検査（tsc）はファイル単位にできないため、ここでは行わない。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const TARGET = /\.(ts|tsx|mjs|cjs|js)$/;

function readFilePath() {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    return input?.tool_input?.file_path ?? input?.tool_response?.filePath ?? null;
  } catch {
    return null;
  }
}

// Windows の .cmd を経由せず、各ツールの JS を node で直接動かす（シェルを挟まないため引数がそのまま渡る）
const require = createRequire(path.join(ROOT, 'package.json'));
const ENTRY = {
  prettier: () => require.resolve('prettier/bin/prettier.cjs'),
  eslint: () => path.join(path.dirname(require.resolve('eslint/package.json')), 'bin', 'eslint.js'),
};

function run(name, args) {
  execFileSync(process.execPath, [ENTRY[name](), ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
}

const file = readFilePath();
if (!file || !TARGET.test(file) || !existsSync(file)) process.exit(0);
const relative = path.relative(ROOT, path.resolve(file));
if (relative.startsWith('..') || /(^|[\\/])(node_modules|\.next|\.turbo)[\\/]/.test(relative)) process.exit(0);

try {
  run('prettier', ['--write', '--log-level', 'warn', relative]);
} catch {
  // 構文の誤り等で整形できない場合は、ESLint の指摘に任せる
}

try {
  run('eslint', ['--max-warnings', '0', '--no-warn-ignored', relative]);
} catch (thrown) {
  const output = `${thrown.stdout ?? ''}${thrown.stderr ?? ''}`.trim();
  process.stderr.write(`ESLint の指摘があります（${relative}）:\n${output}\n`);
  process.exit(2);
}
