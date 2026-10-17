// scripts/check-catalog.mjs
//
// 依存パッケージの版が pnpm-workspace.yaml の catalog だけで決まっているかを確かめる（`pnpm lint` の一部）。
// - 各 package.json の依存は "catalog:"（ワークスペース内のパッケージは "workspace:*"）で書く
// - catalog の項目はどこかで使われている
// 方針は docs/DEPENDENCIES.md。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEP_KINDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/** pnpm-workspace.yaml から packages と catalog の項目名を読む（この2つの単純な形だけを想定する） */
function readWorkspace() {
  const lines = readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8').split(/\r?\n/);
  const packages = [];
  const catalog = new Set();
  let section = null;
  for (const line of lines) {
    if (/^\S/.test(line)) section = line.replace(/:.*$/, '');
    const item = line.match(/^\s+-\s+'?([^'#]+?)'?\s*$/);
    const entry = line.match(/^\s+'?([^'\s:#][^':]*)'?:\s*\S/);
    if (section === 'packages' && item) packages.push(item[1]);
    if (section === 'catalog' && entry) catalog.add(entry[1]);
  }
  return { packages, catalog };
}

function packageDirs(patterns) {
  const dirs = ['.'];
  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const base = pattern.slice(0, -2);
      for (const name of readdirSync(path.join(REPO_ROOT, base))) dirs.push(`${base}/${name}`);
    } else {
      dirs.push(pattern);
    }
  }
  return dirs.filter((dir) => existsSync(path.join(REPO_ROOT, dir, 'package.json')));
}

const { packages, catalog } = readWorkspace();
const errors = [];
const used = new Set();

for (const dir of packageDirs(packages)) {
  const file = path.posix.join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, file), 'utf8'));
  for (const kind of DEP_KINDS) {
    for (const [name, spec] of Object.entries(pkg[kind] ?? {})) {
      if (spec.startsWith('workspace:')) continue;
      if (spec !== 'catalog:') {
        errors.push(`${file} の ${kind}.${name} が "${spec}" です。版は pnpm-workspace.yaml の catalog に書き、ここは "catalog:" にしてください。`);
      } else if (!catalog.has(name)) {
        errors.push(`${file} の ${kind}.${name} が catalog にありません。pnpm-workspace.yaml の catalog に追加してください。`);
      }
      used.add(name);
    }
  }
}

for (const name of catalog) {
  if (!used.has(name)) errors.push(`catalog の ${name} はどのパッケージからも使われていません。pnpm-workspace.yaml から削除してください。`);
}

if (errors.length) {
  for (const message of errors) process.stderr.write(`[check-catalog] ${message}\n`);
  process.exit(1);
}
