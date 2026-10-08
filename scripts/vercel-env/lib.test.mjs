// 実行: node --test scripts/vercel-env/lib.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { ENVIRONMENTS } from './environments.mjs';
import { LOCAL, OPTIONAL, UNSET, MANIFEST } from './manifest.mjs';
import { buildValuesFile, diffProject, quoteEnvValue, resolveDesired, sha256, validateValue } from './lib.mjs';

const config = ENVIRONMENTS.staging;

/** @type {import('./manifest.mjs').EnvVarDefinition[]} */
const manifest = [
  { key: 'SITE', apps: ['admin', 'coach'], group: 'g', description: 'd', validate: 'https-url', value: { default: ({ app, config: c }) => c.urls[app] } },
  { key: 'SECRET', apps: ['admin', 'coach'], group: 'g', description: 'd', secret: true, value: { default: LOCAL } },
  { key: 'MODE', apps: ['admin'], group: 'g', description: 'd', validate: ['all', 'off'], value: { default: 'all', staging: 'off' } },
  { key: 'OPT', apps: ['admin'], group: 'g', description: 'd', value: { default: OPTIONAL } },
  { key: 'GONE', apps: ['admin'], group: 'g', description: 'd', value: { default: UNSET } },
  { key: 'OLD', apps: ['admin'], group: 'g', description: 'd', removed: true, value: { default: UNSET } },
];
const known = new Map(manifest.map((d) => [d.key, d]));

test('定義と値ファイルから、アプリごとの値を決める', () => {
  const { desired, errors } = resolveDesired({ env: 'staging', config, values: { SECRET: 's3cret', VERCEL_TOKEN: 'x' }, manifest });
  assert.deepEqual(errors, []);
  assert.equal(desired.admin.get('SITE').value, 'https://blueprint-admin-stg.vercel.app');
  assert.equal(desired.coach.get('SITE').value, 'https://blueprint-coach-stg.vercel.app');
  assert.equal(desired.coach.get('SECRET').value, 's3cret');
  assert.equal(desired.admin.get('MODE').value, 'off');
  assert.equal(desired.admin.get('OPT').value, undefined);
  assert.equal(desired.admin.has('OLD'), false);
});

test('必須の値の不足・打ち間違い・定義で決まる変数の記入をエラーにする', () => {
  const { errors } = resolveDesired({ env: 'staging', config, values: { SECRT: 'x', MODE: 'all', OLD: 'x' }, manifest });
  assert.equal(errors.length, 4);
  assert.match(errors.join('\n'), /SECRT: 定義（manifest.mjs）に無い変数/);
  assert.match(errors.join('\n'), /MODE: staging では定義で値が決まる/);
  assert.match(errors.join('\n'), /OLD: 廃止した変数/);
  assert.match(errors.join('\n'), /SECRET: 値ファイルに値がありません/);
});

test('値の形式を確かめる', () => {
  const site = manifest[0];
  assert.match(validateValue(site, 'http://example.com'), /https/);
  assert.match(validateValue(site, 'https://example.com/'), /末尾/);
  assert.equal(validateValue(site, 'https://example.com'), undefined);
  const from = MANIFEST.find((d) => d.key === 'MAIL_FROM_NOTIFY');
  assert.equal(validateValue(from, '[STG] Gabby <notify@mail.gabbyacademy.com>'), undefined);
  assert.ok(validateValue(from, 'notify@mail.gabbyacademy.com'));
  const role = MANIFEST.find((d) => d.key === 'SUPABASE_SERVICE_ROLE_KEY');
  const jwt = (ref) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ ref, role: 'service_role' })).toString('base64url')}.sig`;
  assert.equal(validateValue(role, jwt(config.supabaseRef), { supabaseRef: config.supabaseRef }), undefined);
  assert.match(validateValue(role, jwt('xzoefwwzminkqqzbhtwq'), { supabaseRef: config.supabaseRef }), /別の Supabase/);
});

function diff(records, stateHashes = {}) {
  const { desired } = resolveDesired({ env: 'staging', config, values: { SECRET: 's3cret' }, manifest });
  return diffProject({ desired: desired.admin, records, targets: ['production'], known, stateHashes });
}

test('Vercel との差分: 追加・変更・変更なし', () => {
  const { changes } = diff([
    { id: '1', key: 'SITE', type: 'encrypted', target: ['production'], value: 'http://wrong' },
    { id: '2', key: 'MODE', type: 'plain', target: ['production'], value: 'off' },
  ]);
  assert.deepEqual(changes.map((c) => [c.action, c.key]), [['add', 'SECRET'], ['update', 'SITE']]);
  assert.equal(changes[0].type, 'encrypted');
  assert.equal(changes[1].before, 'http://wrong');
});

test('読み出せない値（型が同じ場合）は手元のハッシュで比べ、記録が無ければ上書きする', () => {
  const record = { id: '3', key: 'SECRET', type: 'encrypted', target: ['production'] };
  const others = [
    { id: '1', key: 'SITE', type: 'encrypted', target: ['production'], value: 'https://blueprint-admin-stg.vercel.app' },
    { id: '2', key: 'MODE', type: 'encrypted', target: ['production'], value: 'off' },
  ];
  assert.deepEqual(diff([record, ...others], { SECRET: sha256('s3cret') }).changes, []);
  const unknown = diff([record, ...others]).changes;
  assert.equal(unknown[0].action, 'update');
  assert.equal(unknown[0].unknown, true);
  const changed = diff([record, ...others], { SECRET: sha256('old') }).changes;
  assert.equal(changed[0].unknown, false);
});

test('Sensitive で登録された変数は encrypted に作り直す', () => {
  const { changes } = diff([{ id: '3', key: 'SECRET', type: 'sensitive', target: ['production'] }]);
  const change = changes.find((c) => c.key === 'SECRET');
  assert.equal(change.action, 'recreate');
  assert.equal(change.type, 'encrypted');
});

test('削除: 設定しない定義・定義に無い変数・他の Environment と共有のレコード', () => {
  const { changes, warnings } = diff([
    { id: '4', key: 'GONE', type: 'encrypted', target: ['production'], value: 'x' },
    { id: '5', key: 'OLD', type: 'encrypted', target: ['production', 'preview'], value: 'x' },
    { id: '6', key: 'TYPO', type: 'encrypted', target: ['production'], value: 'x' },
    { id: '7', key: 'VERCEL_OIDC_TOKEN', type: 'system', target: ['production'] },
    { id: '10', key: 'NEXT_PUBLIC_AXIOM_INGEST_ENDPOINT', type: 'plain', target: ['production'], integration: 'icfg_x', value: 'x' },
    { id: '8', key: 'OPT', type: 'encrypted', target: ['preview'], value: 'x' },
    { id: '9', key: 'OPT', type: 'encrypted', target: ['production'], gitBranch: 'feature', value: 'x' },
  ]);
  const byKey = Object.fromEntries(changes.map((c) => [c.key, c]));
  assert.equal(byKey.GONE.action, 'delete');
  assert.equal(byKey.GONE.reason, 'unset');
  assert.equal(byKey.OLD.reason, 'removed');
  assert.deepEqual(byKey.OLD.remaining, ['preview']);
  assert.equal(byKey.TYPO.action, 'unmanaged');
  assert.equal(byKey.VERCEL_OIDC_TOKEN, undefined);
  assert.equal(byKey.NEXT_PUBLIC_AXIOM_INGEST_ENDPOINT, undefined);
  assert.equal(byKey.OPT, undefined);
  assert.match(warnings.join('\n'), /OPT: ブランチ feature 専用/);
});

test('値ファイルは書いた値をそのまま読み戻せる', () => {
  for (const v of ['plain', 'with space', '[STG] Name <a@b.co>', 'has#hash', "it's", 'a"b\\c']) {
    assert.equal(parseEnv(`K=${quoteEnvValue(v)}`).K, v, v);
  }
  const text = buildValuesFile({ env: 'staging', label: 'staging', values: { SECRET: 'x y', EXTRA: '1' }, notes: { SECRET: '確認' }, manifest });
  const parsed = parseEnv(text);
  assert.equal(parsed.SECRET, 'x y');
  assert.equal(parsed.OPT, '');
  assert.equal(parsed.EXTRA, '1');
  assert.equal(parsed.SITE, undefined);
  assert.match(text, /# 注意: 確認/);
});
