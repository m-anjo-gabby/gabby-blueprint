// supabase/release/types.mjs
//
// アプリが使う DB の型定義（packages/types/database.ts）を実DBから生成する。
// Supabase のクライアント（packages/lib/supabase/*）はこの型で問い合わせの列・戻り値を型検査する。
// テーブル・関数を変えたら、リリーススクリプトを dev に適用した後に --write で作り直し、同じコミットに含める
// （DDL の正本の schema.mjs --write と同じタイミング。手順は supabase/DDL/README.md）。
//
// 使い方（リポジトリ直下で実行。DBへは読み取りのみ）:
//   node supabase/release/types.mjs --env=dev --check   型定義と実DBの差分の有無を確認
//   node supabase/release/types.mjs --env=dev --write   型定義を実DBの内容で書き直す

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { api, connect, ENVS, REPO_ROOT } from './lib/connection.mjs';
import { askSecret } from './lib/prompt.mjs';

const OUTPUT = path.join(REPO_ROOT, 'packages/types/database.ts');
/** アプリから問い合わせるスキーマ（private は .schema('private') で使う） */
const SCHEMAS = ['public', 'private'];
const HEADER = `// このファイルは supabase/release/types.mjs が実DBから生成する。手で編集しない。
// 更新: node supabase/release/types.mjs --env=dev --write
`;

function fail(message) {
  console.error(`\n[中止] ${message}`);
  process.exit(1);
}

/**
 * 関数（RPC）の引数を null も渡せる型にする。
 * 生成される型は引数に null を含めないが、PostgreSQL の関数は（STRICT でない限り）どの引数にも NULL を受け取り、
 * アプリも「未指定」を null で渡している。省略（undefined）に置き換えると既定値が使われ意味が変わるため、型の側を合わせる。
 */
function allowNullArgs(types) {
  const nullable = (type) => (/\bnull\b|\bJson\b/.test(type) ? type : `${type} | null`);
  const lines = types.split('\n');
  const out = [];
  let argsIndent = null;
  for (const line of lines) {
    // 1行の形: Args: { _a?: boolean; _b: string }
    const inline = line.match(/^(\s*Args: \{ )(.*)( \}.*)$/);
    if (argsIndent === null && inline) {
      const props = inline[2]
        .split('; ')
        .map((p) => p.replace(/^(\w+\??): (.+)$/, (_, k, t) => `${k}: ${nullable(t)}`));
      out.push(`${inline[1]}${props.join('; ')}${inline[3]}`);
      continue;
    }
    // 複数行の形: Args: { ... }
    const open = line.match(/^(\s*)Args: \{$/);
    if (argsIndent === null && open) {
      argsIndent = open[1];
      out.push(line);
      continue;
    }
    if (argsIndent !== null) {
      if (line === `${argsIndent}}`) argsIndent = null;
      else {
        const prop = line.match(/^(\s+\w+\??): (.+)$/);
        if (prop) {
          out.push(`${prop[1]}: ${nullable(prop[2])}`);
          continue;
        }
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 区分値の列（CHECK 制約の値の一覧）
// ---------------------------------------------------------------------------
const ENUM_CHECK_SQL = `
select n.nspname as schema, c.relname as tbl, a.attname as col, pg_get_constraintdef(con.oid) as def
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum = any (con.conkey)
where con.contype = 'c' and n.nspname in (${SCHEMAS.map((s) => `'${s}'`).join(', ')})
order by 1, 2, 3, con.conname`;

/**
 * CHECK 制約から、列の取りうる値の一覧を読む。
 * 制約の中でその列が「列 = ANY (ARRAY[...])」（列 IN (...) も同じ形になる）に1回だけ現れ、
 * ほかは「列 IS NULL」だけの場合に限る（他の列の値で許す値が変わる制約も、この列の値の一覧としては正しい）。
 * 範囲（>= / <=）・文字数・他の値との比較（列 = 3 等）がある列は対象外。
 */
function parseEnumCheck(col, def) {
  // 「(列)::text」の型変換と括弧を外して、列の現れ方だけを見る
  const body = def
    .replace(/^CHECK /, '')
    .replace(new RegExp(`\\(${col}\\)::\\w+(?: varying)?`, 'g'), col)
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ');
  const mentions = [...body.matchAll(new RegExp(`\\b${col}\\b(?!')( = ANY ARRAY\\[([^\\]]*)\\]| IS NULL)?`, 'g'))];
  const lists = mentions.filter((m) => m[2] !== undefined);
  if (lists.length !== 1 || mentions.some((m) => m[1] === undefined)) return null;
  const values = [...lists[0][2].matchAll(/'((?:[^']|'')*)'(?:::[\w ]+)?|(-?\d+(?:\.\d+)?)/g)].map((v) =>
    v[1] !== undefined ? JSON.stringify(v[1].replace(/''/g, "'")) : v[2],
  );
  return values.length > 0 ? values : null;
}

/** schema.table.col → 値の一覧（TypeScript のリテラル）。同じ列に複数の制約がある場合は、すべてで許される値だけにする */
async function loadEnumColumns(query) {
  const rows = await query(ENUM_CHECK_SQL);
  const map = new Map();
  for (const r of rows) {
    const values = parseEnumCheck(r.col, r.def);
    if (!values) continue;
    const key = `${r.schema}.${r.tbl}.${r.col}`;
    const prev = map.get(key);
    map.set(key, prev ? prev.filter((v) => values.includes(v)) : values);
  }
  return map;
}

/**
 * テーブルの Row / Insert / Update のうち、区分値の列の型を取りうる値の型にする（例: status: number → status: 1 | 9）。
 * packages/types の定数（SESSION_STATUS 等）と CHECK 制約がずれると、アプリ側の型チェックで分かる。
 */
function narrowEnumColumns(types, enumColumns) {
  const lines = types.split('\n');
  let schema = null;
  let section = null;
  let table = null;
  let part = null;
  return lines
    .map((line) => {
      const m = line.match(/^( *)(\w+)(\??): (.*)$/);
      if (!m) return line;
      const [, indent, key, optional, rest] = m;
      if (indent.length === 2 && rest === '{') {
        schema = key;
        section = table = part = null;
        return line;
      }
      if (indent.length === 4 && rest === '{') {
        section = key;
        table = part = null;
        return line;
      }
      if (indent.length === 6 && rest === '{') {
        table = key;
        part = null;
        return line;
      }
      if (indent.length === 8 && rest === '{') {
        part = key;
        return line;
      }
      if (indent.length !== 10 || section !== 'Tables' || !['Row', 'Insert', 'Update'].includes(part)) return line;
      const values = enumColumns.get(`${schema}.${table}.${key}`);
      if (!values) return line;
      const nullable = /\| null$/.test(rest);
      return `${indent}${key}${optional}: ${values.join(' | ')}${nullable ? ' | null' : ''}`;
    })
    .join('\n');
}

function parseArgs(argv) {
  const opts = { env: undefined, mode: undefined };
  for (const arg of argv) {
    if (arg.startsWith('--env=')) opts.env = arg.slice('--env='.length);
    else if (['--check', '--write'].includes(arg)) opts.mode = arg.slice(2);
    else fail(`不明なオプションです: ${arg}`);
  }
  if (!ENVS.includes(opts.env)) fail(`--env には ${ENVS.join(' / ')} のいずれかを指定してください。`);
  if (!opts.mode) fail('--check / --write のいずれかを指定してください。');
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { project, ref, token, query } = await connect(opts.env, askSecret).catch((e) => fail(e.message));
  const res = await api(token, 'GET', `/projects/${ref}/types/typescript?included_schemas=${SCHEMAS.join(',')}`).catch(
    (e) => fail(`型定義の生成に失敗しました: ${e.message}`),
  );
  const enumColumns = await loadEnumColumns(query).catch((e) => fail(`CHECK 制約の取得に失敗しました: ${e.message}`));
  const generated = HEADER + narrowEnumColumns(allowNullArgs(res.types.replace(/\r\n/g, '\n')), enumColumns);
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n') : '';
  const relative = path.relative(REPO_ROOT, OUTPUT).split(path.sep).join('/');
  console.log(`\n接続先: ${project.name}`);

  if (generated === current) {
    console.log(`${relative} は実DBと一致しています。`);
    return;
  }
  if (opts.mode === 'check') {
    console.log(
      `${relative} が実DBと異なります。node supabase/release/types.mjs --env=${opts.env} --write で作り直してください。`,
    );
    process.exit(1);
  }
  writeFileSync(OUTPUT, generated);
  console.log(`${relative} を書き直しました。型チェック（pnpm typecheck）で影響を確認してください。`);
}

main();
