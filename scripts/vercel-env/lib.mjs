// scripts/vercel-env/lib.mjs
//
// vercel-env の処理のうち、入出力を伴わない部分（値の決定・検証・差分・ファイルの組み立て）。
// run.mjs から使い、lib.test.mjs で単体テストする。

import { createHash } from 'node:crypto';
import { LOCAL, OPTIONAL, UNSET, MANIFEST, SYSTEM_KEY_PATTERN } from './manifest.mjs';

/** 値ファイルに書くが Vercel には反映しないキー */
export const RESERVED_KEYS = ['VERCEL_TOKEN'];

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** 秘密の値の表示（中身は出さず、長さとハッシュの先頭だけ） */
export function mask(value) {
  return `●●●●（${value.length}文字 #${sha256(value).slice(0, 6)}）`;
}

export function displayValue(def, value) {
  if (value === undefined) return '';
  return def?.secret ? mask(value) : JSON.stringify(value);
}

/** その環境での値の決め方 */
export function specFor(def, env) {
  return def.value[env] ?? def.value.default;
}

/** 値ファイルに書く変数か（LOCAL / OPTIONAL） */
export function isLocalSpec(spec) {
  return spec === LOCAL || spec === OPTIONAL;
}

// ---------------------------------------------------------------------------
// 検証
// ---------------------------------------------------------------------------

const MAIL_ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/**
 * 値の形式を確かめる。問題があればメッセージを返す。
 * @param {import('./manifest.mjs').EnvVarDefinition} def
 * @param {string} value
 * @param {{ supabaseRef?: string }} ctx
 */
export function validateValue(def, value, ctx = {}) {
  if (value !== value.trim()) return '前後に空白があります';
  const v = def.validate;
  if (v) {
    const problem = runValidator(v, value);
    if (problem) return problem;
  }
  // 取り違え防止: JWT 形式の Supabase のキーは、含まれるプロジェクトが接続先と一致すること
  if (ctx.supabaseRef && def.key.includes('SUPABASE') && value.startsWith('eyJ')) {
    const ref = jwtProjectRef(value);
    if (ref && ref !== ctx.supabaseRef) return `別の Supabase プロジェクト（${ref}）のキーです`;
  }
  return undefined;
}

function runValidator(v, value) {
  if (Array.isArray(v)) return v.includes(value) ? undefined : `${v.join(' / ')} のいずれかにしてください`;
  if (v instanceof RegExp) return v.test(value) ? undefined : `形式が違います（${v}）`;
  switch (v) {
    case 'https-url':
      if (!/^https:\/\/[^\s/]+(\/\S*)?$/.test(value)) return 'https:// で始まる URL にしてください';
      if (value.endsWith('/')) return '末尾の / は付けないでください';
      return undefined;
    case 'mail-from': {
      const m = value.match(/^(.+?)\s*<([^>]+)>$/);
      if (!m || !MAIL_ADDRESS.test(m[2])) return '「名前 <アドレス>」の形式にしてください';
      return undefined;
    }
    case 'email-list':
      return splitList(value).every((a) => MAIL_ADDRESS.test(a)) ? undefined : 'メールアドレスをカンマ区切りで書いてください';
    case 'domain-list':
      return splitList(value).every((d) => DOMAIN.test(d)) ? undefined : 'ドメインをカンマ区切りで書いてください';
    case 'random-secret':
      return value.length >= 32 ? undefined : '32文字以上のランダムな文字列にしてください（--init で作成できます）';
    case 'minutes':
      return /^[1-9][0-9]*$/.test(value) ? undefined : '1以上の整数（分）にしてください';
    default:
      throw new Error(`不明な検証の種類です: ${v}`);
  }
}

function splitList(value) {
  return value.split(',').map((s) => s.trim());
}

function jwtProjectRef(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.ref === 'string' ? payload.ref : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// 値の決定
// ---------------------------------------------------------------------------

/**
 * 定義と値ファイルから、アプリごとの「あるべき値」を決める。
 * @param {{ env: string, config: import('./environments.mjs').EnvironmentConfig, values: Record<string, string>, manifest?: import('./manifest.mjs').EnvVarDefinition[] }} args
 * @returns {{ desired: Record<string, Map<string, { def: import('./manifest.mjs').EnvVarDefinition, value: string | undefined }>>, errors: string[] }}
 *   value が undefined の変数は「設定しない」（Vercel にあれば削除する）
 */
export function resolveDesired({ env, config, values, manifest = MANIFEST }) {
  const errors = [];
  const desired = { admin: new Map(), student: new Map(), coach: new Map() };
  const known = new Map(manifest.map((d) => [d.key, d]));

  for (const key of Object.keys(values)) {
    if (RESERVED_KEYS.includes(key)) continue;
    const def = known.get(key);
    if (!def) errors.push(`${key}: 定義（manifest.mjs）に無い変数です。打ち間違いか、定義への追加漏れです`);
    else if (def.removed) errors.push(`${key}: 廃止した変数です。値ファイルから削除してください`);
    else if (!isLocalSpec(specFor(def, env))) errors.push(`${key}: ${env} では定義で値が決まる変数です。値ファイルから削除してください`);
  }

  for (const def of manifest) {
    if (def.removed) continue;
    const spec = specFor(def, env);
    for (const app of def.apps) {
      let value;
      if (typeof spec === 'function') value = spec({ env, app, config });
      else if (spec === LOCAL || spec === OPTIONAL) {
        const raw = values[def.key];
        value = raw === undefined || raw === '' ? undefined : raw;
        if (value === undefined && spec === LOCAL && app === def.apps[0]) {
          errors.push(`${def.key}: 値ファイルに値がありません（${def.description}）`);
        }
      } else if (spec === UNSET) value = undefined;
      else value = spec;

      if (value !== undefined && app === def.apps[0]) {
        const problem = validateValue(def, value, { supabaseRef: config.supabaseRef });
        if (problem) errors.push(`${def.key}: ${problem}`);
      }
      desired[app].set(def.key, { def, value });
    }
  }
  return { desired, errors };
}

// ---------------------------------------------------------------------------
// Vercel との差分
// ---------------------------------------------------------------------------

/** Vercel の環境変数の target を配列にそろえる */
export function normalizeTargets(target) {
  if (!target) return [];
  return Array.isArray(target) ? target : [target];
}

/**
 * Vercel に登録する型。秘密の値も含めて encrypted（Vercel の画面で値を確認できる型）にする。
 * Sensitive（登録後は読み出せない型）は使わない: プロジェクトに入れるのは構成管理の担当者だけのため、
 * 画面で値を目視確認できる利便性を優先する（2026-10-08 決定）。Sensitive で登録された変数は作り直す。
 */
export function vercelTypeFor() {
  return 'encrypted';
}

/**
 * 1つのプロジェクトの差分を作る。
 * @param {{
 *   desired: Map<string, { def: import('./manifest.mjs').EnvVarDefinition, value: string | undefined }>,
 *   records: Array<{ id: string, key: string, type: string, target: string[], gitBranch?: string, integration?: string, value?: string }>,
 *   targets: string[],
 *   known: Map<string, import('./manifest.mjs').EnvVarDefinition>,
 *   stateHashes: Record<string, string>,
 * }} args records の value は読み出せた値（Sensitive は undefined）
 */
export function diffProject({ desired, records, targets, known, stateHashes }) {
  /** @type {Array<Record<string, unknown>>} */
  const changes = [];
  const warnings = [];
  const relevant = [];
  for (const r of records) {
    // Vercel の自動設定・連携機能（Axiom 等）が管理する変数は対象外
    if (SYSTEM_KEY_PATTERN.test(r.key) || r.integration) continue;
    const t = normalizeTargets(r.target);
    if (!t.some((x) => targets.includes(x))) continue;
    if (r.gitBranch) {
      warnings.push(`${r.key}: ブランチ ${r.gitBranch} 専用の値があります（管理対象外。必要なら手動で整理）`);
      continue;
    }
    relevant.push({ ...r, target: t });
  }
  const byKey = new Map();
  for (const r of relevant) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);

  const keys = new Set([...desired.keys(), ...byKey.keys()]);
  for (const key of [...keys].sort()) {
    const want = desired.get(key);
    const found = byKey.get(key) ?? [];
    if (found.length > 1) {
      warnings.push(`${key}: 同じ対象に複数の値が登録されています。Vercel の画面で1つに整理してから再実行してください`);
      continue;
    }
    const record = found[0];
    const def = want?.def;

    if (want && want.value !== undefined) {
      const type = vercelTypeFor();
      if (!record) {
        changes.push({ action: 'add', key, def, value: want.value, type, targets });
        continue;
      }
      const extra = record.target.filter((t) => !targets.includes(t));
      const allTargets = [...new Set([...record.target, ...targets])];
      const shared = extra.length > 0 ? extra : undefined;
      const sameType = record.type === type || (type === 'encrypted' && record.type === 'plain');
      if (!sameType) {
        changes.push({ action: 'recreate', key, def, value: want.value, type, targets: allTargets, record, shared, from: record.type });
        continue;
      }
      let current = record.value;
      let unknown = false;
      if (current === undefined) {
        const hash = stateHashes[key];
        if (hash === sha256(want.value)) current = want.value;
        else unknown = !hash;
      }
      const targetsMissing = targets.some((t) => !record.target.includes(t));
      if (current === want.value && !targetsMissing) continue;
      changes.push({ action: 'update', key, def, value: want.value, before: current, unknown, type, targets: allTargets, record, shared });
      continue;
    }

    if (!record) continue;
    const knownDef = known.get(key);
    const reason = !knownDef ? 'unmanaged' : knownDef.removed ? 'removed' : want ? 'unset' : 'not-for-app';
    const remaining = record.target.filter((t) => !targets.includes(t));
    changes.push({ action: reason === 'unmanaged' ? 'unmanaged' : 'delete', key, def: knownDef, record, reason, remaining });
  }
  return { changes, warnings };
}

// ---------------------------------------------------------------------------
// ファイルの組み立て
// ---------------------------------------------------------------------------

export function quoteEnvValue(value) {
  if (!/[\s#"'\\]/.test(value)) return value;
  if (!value.includes("'") && !value.includes('\n')) return `'${value}'`;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function groupBy(defs) {
  const groups = new Map();
  for (const def of defs) groups.set(def.group, [...(groups.get(def.group) ?? []), def]);
  return groups;
}

function commentLines(text) {
  return text.split('\n').map((line) => `# ${line}`);
}

/**
 * 値ファイル（values/.env.<env>）の内容を組み立てる。
 * @param {{ env: string, label: string, values: Record<string, string>, notes?: Record<string, string>, manifest?: import('./manifest.mjs').EnvVarDefinition[] }} args
 */
export function buildValuesFile({ env, label, values, notes = {}, manifest = MANIFEST }) {
  const lines = [
    '# =========================================================================',
    `# アプリの環境変数の値（${label}）。Git 管理外。scripts/vercel-env/run.mjs が読み込む。`,
    '# 書くのは「値ファイルで決める変数」だけ。URL・固定値は manifest.mjs / environments.mjs で決まる。',
    `# 変数の追加・不足の補充は: node scripts/vercel-env/run.mjs --env=${env} --init`,
    '# =========================================================================',
    '',
    '# Vercel のアクセストークン（Vercel には反映しない）。本番は空欄にし、実行時に入力することを推奨',
    `VERCEL_TOKEN=${quoteEnvValue(values.VERCEL_TOKEN ?? '')}`,
  ];
  const defs = manifest.filter((d) => !d.removed && isLocalSpec(specFor(d, env)));
  for (const [group, items] of groupBy(defs)) {
    lines.push('', `# ---- ${group}`);
    for (const def of items) {
      const spec = specFor(def, env);
      lines.push(...commentLines(`${def.description}（${def.apps.join('・')}${spec === OPTIONAL ? '。任意' : '。必須'}${def.secret ? '。秘密' : ''}）`));
      if (notes[def.key]) lines.push(...commentLines(`注意: ${notes[def.key]}`));
      lines.push(`${def.key}=${quoteEnvValue(values[def.key] ?? '')}`);
    }
  }
  const leftovers = Object.keys(values).filter(
    (k) => !RESERVED_KEYS.includes(k) && !defs.some((d) => d.key === k),
  );
  if (leftovers.length > 0) {
    lines.push('', '# ---- 定義に無い・この環境では値ファイルで決めない変数（確認して削除してください）');
    for (const k of leftovers) lines.push(`${k}=${quoteEnvValue(values[k])}`);
  }
  return `${lines.join('\n')}\n`;
}

/** apps/<app>/.env.example の内容を組み立てる */
export function buildExampleFile(app, manifest = MANIFEST) {
  const lines = [
    `# このファイルは apps/${app}/.env.local のテンプレートです（scripts/vercel-env/manifest.mjs から自動生成。直接編集しない）。`,
    '# 変数を追加・変更する場合は manifest.mjs を変更し、`node scripts/vercel-env/run.mjs --write-examples` で作り直してください。',
    '# staging・本番の値は scripts/vercel-env/run.mjs で Vercel に反映します（scripts/vercel-env/README.md）。',
  ];
  if (app !== 'coach') {
    lines.push('', '# Vercel CLI（`vercel env pull` で入る。手で設定しない）', 'VERCEL_OIDC_TOKEN=');
  }
  const defs = manifest.filter((d) => !d.removed && d.apps.includes(app));
  for (const [group, items] of groupBy(defs)) {
    lines.push('', '# ============================================================', `# ${group}`, '# ============================================================');
    for (const def of items) {
      lines.push(...commentLines(def.description));
      lines.push(`${def.key}=`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** apps/<app>/.env.<env> の内容を組み立てる（テスト等が読む控え） */
export function buildAppEnvFile({ app, env, desired }) {
  const lines = [
    `# apps/${app} の ${env} の環境変数（scripts/vercel-env/run.mjs --env=${env} --write-app-env で自動生成。直接編集しない）。`,
    `# 値を変える場合は scripts/vercel-env/values/.env.${env} または manifest.mjs を変更して作り直してください。`,
  ];
  let group;
  for (const [key, { def, value }] of desired) {
    if (value === undefined) continue;
    if (def.group !== group) {
      group = def.group;
      lines.push('', `# ---- ${group}`);
    }
    lines.push(`${key}=${quoteEnvValue(value)}`);
  }
  return `${lines.join('\n')}\n`;
}
