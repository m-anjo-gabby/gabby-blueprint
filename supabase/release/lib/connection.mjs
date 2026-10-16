// supabase/release/lib/connection.mjs
//
// run.mjs（リリーススクリプトの適用）と schema.mjs（DDL正本と実DBの突き合わせ）で共有する、
// 環境ファイルの読み込みと Supabase Management API の呼び出し。

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const RELEASE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(RELEASE_DIR, '../..');
const ENV_DIR = path.join(RELEASE_DIR, 'env');
const API_BASE = 'https://api.supabase.com/v1';

export const ENVS = ['dev', 'staging', 'prod'];
// 取り違え防止: プロジェクト名にこの文字列が含まれない場合は中止する（blueprint-dev/stg/prod）
const PROJECT_NAME_HINT = { dev: 'dev', staging: 'stg', prod: 'prod' };

export async function api(token, method, pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const message = typeof json === 'object' && json?.message ? json.message : text;
    throw new Error(`HTTP ${res.status}: ${message}`);
  }
  return json;
}

/**
 * supabase/release/env/.env.<env> を読み込み、接続先のプロジェクトを確認する。
 * トークンが空欄の場合は askToken() で入力を求める。失敗時は Error を投げる。
 */
export async function connect(envName, askToken) {
  const envPath = path.join(ENV_DIR, `.env.${envName}`);
  if (!existsSync(envPath)) {
    throw new Error(`環境ファイルがありません: ${path.relative(REPO_ROOT, envPath)}（.env.example を参考に作成してください）`);
  }
  const envVars = parseEnv(readFileSync(envPath, 'utf8'));
  const ref = envVars.SUPABASE_PROJECT_REF;
  if (!ref) throw new Error('SUPABASE_PROJECT_REF が未設定です。');
  if (envVars.SUPABASE_URL && new URL(envVars.SUPABASE_URL).host !== `${ref}.supabase.co`) {
    throw new Error(`SUPABASE_URL (${envVars.SUPABASE_URL}) が SUPABASE_PROJECT_REF (${ref}) と一致しません。`);
  }

  // 環境ファイルが空欄の場合は環境変数（本番の一時トークン等。ファイルに書かずに渡す）、それも無ければ入力を求める
  let token = envVars.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) token = await askToken('SUPABASE_ACCESS_TOKEN を入力してください（入力内容は表示されません）: ');
  if (!token) throw new Error('アクセストークンが入力されませんでした。');

  const project = await api(token, 'GET', `/projects/${ref}`).catch((e) => {
    throw new Error(`プロジェクト情報の取得に失敗しました: ${e.message}`);
  });
  if (!project.name.includes(PROJECT_NAME_HINT[envName])) {
    throw new Error(`--env=${envName} に対し、プロジェクト名が「${project.name}」です。環境ファイルの取り違えがないか確認してください。`);
  }

  const query = (sql) => api(token, 'POST', `/projects/${ref}/database/query`, { query: sql });
  return { envVars, ref, project, query };
}
