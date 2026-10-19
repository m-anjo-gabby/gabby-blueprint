// supabase/release/schema.mjs
//
// DDLの正本（supabase/DDL/table/*.sql）のうち、テーブル定義の部分を実DBのカタログから生成する。
// 正本の各ファイルは「人が書く設計メモ」と「本ツールが書く定義（マーカーで囲んだ部分）」から成り、
// マーカーの中は手で編集しない（変更はリリーススクリプトで dev に適用してから --write で取り込む）。
// 運用手順は supabase/DDL/README.md を参照。
//
// 使い方（リポジトリ直下で実行。DBへは読み取りのみ）:
//   node supabase/release/schema.mjs --env=dev --check                 正本と実DBの差分・SECURITY DEFINER の関数の決まりを確認
//   node supabase/release/schema.mjs --env=dev --write                 全ての正本のマーカー内を実DBの内容で書き直す
//   node supabase/release/schema.mjs --env=dev --write com_t_session   指定テーブルのみ書き直す
//   node supabase/release/schema.mjs --env=dev --print com_t_session   生成結果を表示（ファイルは変更しない）
//
// マーカー（テーブルごと。1ファイルに複数あってよい）:
//   -- @schema public.com_t_session
//   ...（生成された定義）
//   -- @end-schema

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { connect, ENVS, REPO_ROOT } from './lib/connection.mjs';
import { askSecret } from './lib/prompt.mjs';

const TABLE_DIR = path.join(REPO_ROOT, 'supabase/DDL/table');
const SCHEMAS = ['public', 'ops'];
// 生成の対象外（手書きの正本）。ops.release_history は run.mjs が実行時に読み込んで作るため冪等な手書きのままにする
const HAND_WRITTEN = ['ops.release_history'];
const MARKER_RE = /^-- @schema ([a-z_]+\.[a-z0-9_]+)\r?\n[\s\S]*?^-- @end-schema$/gm;
// 新しいテーブルに既定で付く権限。これと違う場合だけ GRANT/REVOKE を出力する
// （authenticated は Supabase の既定の全権限。anon は書き込みの権限を既定の権限から外しているため参照だけ。
//  リリース 20261016 の「未ログイン（anon）のテーブルへの書き込み権限を外す」）
const API_ROLES = ['anon', 'authenticated'];
const DEFAULT_PRIVILEGES = {
  anon: 'SELECT',
  authenticated: 'DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
};

function fail(message) {
  console.error(`\n[中止] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { env: undefined, mode: undefined, tables: [] };
  for (const arg of argv) {
    if (arg.startsWith('--env=')) opts.env = arg.slice('--env='.length);
    else if (['--check', '--write', '--print'].includes(arg)) opts.mode = arg.slice(2);
    else if (arg.startsWith('--')) fail(`不明なオプションです: ${arg}`);
    else opts.tables.push(arg.includes('.') ? arg : `public.${arg}`);
  }
  if (!ENVS.includes(opts.env)) fail(`--env には ${ENVS.join(' / ')} のいずれかを指定してください。`);
  if (!opts.mode) fail('--check / --write / --print のいずれかを指定してください。');
  if (opts.mode === 'print' && opts.tables.length === 0) fail('--print には対象テーブルを指定してください。');
  return opts;
}

// ---------------------------------------------------------------------------
// カタログの読み取り
// ---------------------------------------------------------------------------
// search_path を空にして、関数・テーブルの参照をスキーマ付きで出力させる
const CATALOG_SQL = `
set search_path = '';
select json_agg(t order by t.name) as tables from (
  select
    n.nspname || '.' || c.relname as name,
    obj_description(c.oid, 'pg_class') as comment,
    c.relrowsecurity as rls,
    c.relforcerowsecurity as force_rls,
    c.relacl::text[] as acl,
    c.relreplident as replica_identity,
    (select array_agg(p.pubname order by p.pubname) from pg_publication_tables p
     where p.schemaname = n.nspname and p.tablename = c.relname) as publications,
    (select json_agg(json_build_object(
        'name', a.attname,
        'type', format_type(a.atttypid, a.atttypmod),
        'notnull', a.attnotnull,
        'default', pg_get_expr(d.adbin, d.adrelid, true),
        'identity', a.attidentity,
        'generated', a.attgenerated,
        'acl', a.attacl::text[],
        'comment', col_description(a.attrelid, a.attnum)
      ) order by a.attnum)
     from pg_attribute a
     left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns,
    (select json_agg(json_build_object(
        'name', k.conname,
        'type', k.contype,
        'columns', (select array_agg(a.attname order by u.ord) from unnest(k.conkey) with ordinality u(num, ord)
                    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.num),
        'def', pg_get_constraintdef(k.oid, true)
      ) order by k.contype desc, k.conname)
     from pg_constraint k where k.conrelid = c.oid and k.contype in ('p', 'u', 'f', 'c', 'x')) as constraints,
    (select json_agg(pg_get_indexdef(i.indexrelid, 0, true) order by ic.relname)
     from pg_index i join pg_class ic on ic.oid = i.indexrelid
     where i.indrelid = c.oid
       and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid and k.conrelid = c.oid)) as indexes,
    (select json_agg(json_build_object(
        'name', p.polname,
        'permissive', p.polpermissive,
        'cmd', p.polcmd,
        'roles', (select array_agg(case when r = 0 then 'public' else r::regrole::text end order by 1) from unnest(p.polroles) r),
        'using', pg_get_expr(p.polqual, p.polrelid, true),
        'check', pg_get_expr(p.polwithcheck, p.polrelid, true)
      ) order by p.polname)
     from pg_policy p where p.polrelid = c.oid) as policies,
    (select json_agg(pg_get_triggerdef(g.oid, true) order by g.tgname)
     from pg_trigger g where g.tgrelid = c.oid and not g.tgisinternal) as triggers
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and n.nspname in (${SCHEMAS.map((s) => `'${s}'`).join(', ')})
) t;
`;

async function loadCatalog(query) {
  const rows = await query(CATALOG_SQL);
  const tables = rows.at(-1)?.tables ?? rows[0]?.tables ?? [];
  return new Map(tables.map((t) => [t.name, t]));
}

// ---------------------------------------------------------------------------
// DDLの生成
// ---------------------------------------------------------------------------
const quoteLiteral = (text) => `'${text.replace(/'/g, "''")}'`;
const quoteIdent = (name) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`);
const SERIAL_TYPES = { smallint: 'smallserial', integer: 'serial', bigint: 'bigserial' };
const CMD = { r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE', '*': 'ALL' };
const PRIV = { a: 'INSERT', r: 'SELECT', w: 'UPDATE', d: 'DELETE', D: 'TRUNCATE', x: 'REFERENCES', t: 'TRIGGER' };

/** aclitem（例: "authenticated=arwdDxt/postgres"）から指定ロールの権限一覧を取り出す */
function privilegesOf(acl, role) {
  const item = (acl ?? []).find((a) => a.startsWith(`${role}=`));
  if (!item) return [];
  return [...item.slice(role.length + 1).split('/')[0]]
    .map((ch) => PRIV[ch])
    .filter(Boolean)
    .sort();
}

/** Postgres が付ける既定の制約名なら、列定義の中に書いても同じ名前で再現できる */
function isDefaultName(table, constraint) {
  const rel = table.name.split('.')[1];
  const cols = constraint.columns ?? [];
  if (constraint.type === 'p') return constraint.name === `${rel}_pkey`;
  if (cols.length !== 1) return false;
  if (constraint.type === 'f') return constraint.name === `${rel}_${cols[0]}_fkey`;
  if (constraint.type === 'u') return constraint.name === `${rel}_${cols[0]}_key`;
  return false;
}

function renderTable(table) {
  const out = [];
  const columns = table.columns ?? [];
  const constraints = table.constraints ?? [];

  // 単一列の主キー・外部キー・一意制約（既定の名前のもの）は列の行に書く
  const inline = new Map();
  const tableLevel = [];
  for (const k of constraints) {
    if (k.type !== 'c' && k.type !== 'x' && isDefaultName(table, k)) {
      const col = k.columns[0];
      const text =
        k.type === 'p' && k.columns.length === 1
          ? 'PRIMARY KEY'
          : k.type === 'u'
            ? 'UNIQUE'
            : k.type === 'f'
              ? k.def.replace(/^FOREIGN KEY \([^)]*\) /, '')
              : null;
      if (text) {
        inline.set(col, [...(inline.get(col) ?? []), text]);
        continue;
      }
    }
    tableLevel.push(k);
  }

  // 桁揃えの幅は固定にする（最長の列名に合わせると、列の追加で全行が変わり git の差分が読めなくなる）
  const nameWidth = 24;
  const typeWidth = 12;
  const lines = columns.map((c) => {
    // 列が所有する順序の既定値（nextval('<table>_<col>_seq')）は serial 型として書く（順序の作成を含めて再現できる）
    const serial = SERIAL_TYPES[c.type] && c.default === `nextval('${table.name}_${c.name}_seq'::regclass)`;
    if (serial) c = { ...c, type: SERIAL_TYPES[c.type], default: null };
    const parts = [];
    if (c.identity) parts.push(`GENERATED ${c.identity === 'a' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`);
    else if (c.generated === 's') parts.push(`GENERATED ALWAYS AS (${c.default}) STORED`);
    if (c.notnull && !(inline.get(c.name) ?? []).includes('PRIMARY KEY')) parts.push('NOT NULL');
    if (c.default != null && !c.generated) parts.push(`DEFAULT ${c.default}`);
    parts.push(...(inline.get(c.name) ?? []));
    return `    ${quoteIdent(c.name).padEnd(nameWidth)} ${c.type.padEnd(typeWidth)} ${parts.join(' ')}`.trimEnd();
  });
  for (const k of tableLevel) lines.push(`    CONSTRAINT ${quoteIdent(k.name)} ${k.def}`);
  out.push(`CREATE TABLE ${table.name} (`, lines.join(',\n'), ');');

  const comments = [];
  if (table.comment != null) comments.push(`COMMENT ON TABLE ${table.name} IS ${quoteLiteral(table.comment)};`);
  for (const c of columns) {
    if (c.comment != null)
      comments.push(`COMMENT ON COLUMN ${table.name}.${quoteIdent(c.name)} IS ${quoteLiteral(c.comment)};`);
  }
  if (comments.length > 0) out.push('', ...comments);

  if (table.indexes?.length) out.push('', ...table.indexes.map((d) => `${d.replace(' USING btree ', ' ')};`));
  if (table.triggers?.length) out.push('', ...table.triggers.map((d) => `${d};`));

  if (table.rls || table.policies?.length) {
    out.push('');
    if (table.rls) out.push(`ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`);
    if (table.force_rls) out.push(`ALTER TABLE ${table.name} FORCE ROW LEVEL SECURITY;`);
    for (const p of table.policies ?? []) {
      const parts = [`CREATE POLICY "${p.name}" ON ${table.name}`];
      if (!p.permissive) parts.push('AS RESTRICTIVE');
      parts.push(`FOR ${CMD[p.cmd]} TO ${p.roles.join(', ')}`);
      let text = parts.join(' ');
      if (p.using) text += `\nUSING (\n${indent(p.using)}\n)`;
      if (p.check) text += `\nWITH CHECK (\n${indent(p.check)}\n)`;
      out.push('', `${text};`);
    }
  }

  const grants = renderGrants(table);
  if (grants.length > 0) out.push('', ...grants);

  // Realtime の配信対象（REPLICA IDENTITY は既定以外のときだけ）
  const realtime = [];
  if (table.replica_identity === 'f') realtime.push(`ALTER TABLE ${table.name} REPLICA IDENTITY FULL;`);
  for (const pub of table.publications ?? []) realtime.push(`ALTER PUBLICATION ${pub} ADD TABLE ${table.name};`);
  if (realtime.length > 0) out.push('', ...realtime);
  return out.join('\n');
}

function indent(expr) {
  return expr
    .split('\n')
    .map((l) => `    ${l.trimEnd()}`)
    .join('\n');
}

/** anon / authenticated の権限が既定（DEFAULT_PRIVILEGES）と違う場合だけ出力する */
function renderGrants(table) {
  const out = [];
  for (const role of API_ROLES) {
    const privs = privilegesOf(table.acl, role);
    if (privs.join(',') === DEFAULT_PRIVILEGES[role]) continue;
    out.push(`REVOKE ALL ON ${table.name} FROM ${role};`);
    if (privs.length > 0) out.push(`GRANT ${privs.join(', ')} ON ${table.name} TO ${role};`);
  }
  for (const role of API_ROLES) {
    const byPriv = new Map();
    for (const c of table.columns ?? []) {
      for (const p of privilegesOf(c.acl, role)) byPriv.set(p, [...(byPriv.get(p) ?? []), quoteIdent(c.name)]);
    }
    for (const [p, cols] of byPriv) out.push(`GRANT ${p} (${cols.join(', ')}) ON ${table.name} TO ${role};`);
  }
  return out;
}

function renderBlock(table) {
  return `-- @schema ${table.name}\n${renderTable(table)}\n-- @end-schema`;
}

// ---------------------------------------------------------------------------
// 正本ファイルの読み書き
// ---------------------------------------------------------------------------
function readCanonicalFiles() {
  return readdirSync(TABLE_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const file = path.join(TABLE_DIR, f);
      const text = readFileSync(file, 'utf8');
      const blocks = [...text.matchAll(MARKER_RE)].map((m) => ({ table: m[1], text: m[0].replace(/\r\n/g, '\n') }));
      return { file, name: f, text, blocks };
    });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  // 環境ファイルのトークンが空欄（.env.prod の推奨設定）の場合は、環境変数 SUPABASE_ACCESS_TOKEN、それも無ければ入力を求める
  const { project, query } = await connect(opts.env, askSecret).catch((e) => fail(e.message));
  const catalog = await loadCatalog(query).catch((e) => fail(`カタログの取得に失敗しました: ${e.message}`));
  console.log(`\n接続先: ${project.name}（${catalog.size} テーブル）`);

  if (opts.mode === 'print') {
    for (const name of opts.tables) {
      const table = catalog.get(name);
      console.log(table ? `\n${renderBlock(table)}` : `\n-- ${name}: 実DBにありません`);
    }
    return;
  }

  const files = readCanonicalFiles();
  const covered = new Set(files.flatMap((f) => f.blocks.map((b) => b.table)));
  const targets = new Set(opts.tables.length > 0 ? opts.tables : covered);
  for (const name of targets) {
    if (!covered.has(name))
      fail(`マーカー（-- @schema ${name}）のある正本ファイルがありません。先にファイルにマーカーを書いてください。`);
  }

  const diffs = [];
  const missing = [];
  for (const f of files) {
    let next = f.text;
    for (const block of f.blocks) {
      if (!targets.has(block.table)) continue;
      const table = catalog.get(block.table);
      if (!table) {
        missing.push(`${f.name}: ${block.table}`);
        continue;
      }
      const generated = renderBlock(table);
      if (generated === block.text) continue;
      diffs.push({ file: f.name, table: block.table, expected: block.text, actual: generated });
      next = next.replace(MARKER_RE, (m, name) => (name === block.table ? generated : m));
    }
    if (opts.mode === 'write' && next !== f.text) writeFileSync(f.file, next);
  }

  if (missing.length > 0) {
    console.log('\n実DBに無いテーブル（正本ファイルを削除するか、リリースが未適用でないか確認してください）:');
    missing.forEach((m) => console.log(`  ${m}`));
  }
  if (opts.mode === 'write') {
    console.log(
      diffs.length === 0
        ? '\n変更はありません。'
        : `\n${diffs.length} テーブルを書き直しました: ${diffs.map((d) => d.table).join(', ')}`,
    );
  } else {
    if (diffs.length > 0) {
      console.log('\n正本と実DBで内容が違うテーブル:');
      for (const d of diffs) {
        console.log(`\n--- ${d.file} (${d.table})`);
        printLineDiff(d.expected, d.actual);
      }
    }
    const uncovered = [...catalog.keys()].filter((name) => !covered.has(name) && !HAND_WRITTEN.includes(name));
    if (uncovered.length > 0)
      console.log(`\n正本（マーカー）の無いテーブル: ${uncovered.length} 件\n  ${uncovered.join('\n  ')}`);
    console.log(diffs.length === 0 && missing.length === 0 ? '\n正本と実DBは一致しています。' : '');
    const unsafe = await findUnsafeDefinerFunctions(query).catch((e) => fail(`関数の確認に失敗しました: ${e.message}`));
    if (unsafe.length > 0) {
      console.log('\nSECURITY DEFINER の決まりに合わない関数（supabase/DDL/README.md「関数の権限」）:');
      unsafe.forEach((u) => console.log(`  ${u}`));
    }
    if (diffs.length > 0 || missing.length > 0 || unsafe.length > 0) process.exitCode = 1;
  }
}

/**
 * 実DBの SECURITY DEFINER の関数のうち、search_path を固定していないもの・anon が実行できるもの（トリガー以外）を返す。
 * 正本のファイルの書き方は単体テスト（testing/unit/ddl-function-security.test.ts）で見ており、こちらは実DBの状態を見る。
 */
async function findUnsafeDefinerFunctions(query) {
  const rows = await query(`
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS signature,
           coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%' AS has_search_path,
           p.prorettype = 'trigger'::regtype AS is_trigger,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname IN (${[...SCHEMAS, 'private'].map((s) => `'${s}'`).join(', ')})
    ORDER BY 1`);
  return rows.flatMap((r) => {
    const problems = [];
    if (!r.has_search_path) problems.push('search_path を固定していない');
    if (r.anon_can_execute && !r.is_trigger) problems.push('anon が実行できる');
    return problems.length > 0 ? [`${r.signature}: ${problems.join('・')}`] : [];
  });
}

/** 正本側にだけある行を「-」、実DB側にだけある行を「+」で表示する（行単位の簡易な差分） */
function printLineDiff(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const inA = new Set(a);
  const inB = new Set(b);
  a.filter((l) => !inB.has(l)).forEach((l) => console.log(`  - ${l}`));
  b.filter((l) => !inA.has(l)).forEach((l) => console.log(`  + ${l}`));
}

main().catch((e) => fail(e.stack ?? e.message));
