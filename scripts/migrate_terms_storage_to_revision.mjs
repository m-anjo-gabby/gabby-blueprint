// scripts/migrate_terms_storage_to_revision.mjs
//
// 規約本文のDB管理化（2026-09-24）に伴う一回限りのデータ移行スクリプト。
// Storage（termsバケット）上の各規約本文ファイルを読み出し、com_m_terms_revision に
// リビジョン1として登録する。
//
// 【前提】
//   supabase/release/ の該当リリースSQL（com_m_terms_revision 作成等）が適用済みであること。
//
// 【冪等性】
//   既にリビジョンが1件以上存在する規約はスキップするため、何度実行しても安全（resumable）。
//
// 【実行方法】（リポジトリ直下で実行。接続先は --env-file で指定した環境）
//   node --env-file=apps/admin/.env.local scripts/migrate_terms_storage_to_revision.mjs          # 確認のみ(dry-run)
//   node --env-file=apps/admin/.env.local scripts/migrate_terms_storage_to_revision.mjs --apply  # 反映
//
//   必要な環境変数: SUPABASE_URL（または NEXT_PUBLIC_SUPABASE_URL）, SUPABASE_SERVICE_ROLE_KEY
//   ※ supabase/release/run.mjs の適用後作業（@post）として実行する場合は、run.mjs が
//     リリース用環境ファイルの値を渡すため --env-file は不要。
//
// 【本文ファイルが既にStorageに存在しない場合】
//   既定では失敗として報告し登録しない（本文を勝手に補完しないため）。
//   過去版で本文の復元が不可能と確認できた場合に限り、--placeholder-missing を付けると
//   「移行不可」である旨の注記を本文としたリビジョンを登録する（dev環境で発生実績あり）。

import { createRequire } from 'node:module';

// @supabase/supabase-js はルートにhoistされていないため、adminアプリの依存から解決する
const require = createRequire(new URL('../apps/admin/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const PLACEHOLDER_MISSING = process.argv.includes('--placeholder-missing');
const BUCKET = 'terms';
const CHANGE_NOTE = '旧Storage(termsバケット)からの移行分';
const MISSING_CHANGE_NOTE = '旧Storage(termsバケット)からの移行時に本文ファイルが存在しなかったため注記のみ登録';
const MISSING_CONTENT = '> この版の本文は、旧保存領域からの移行時に本文ファイルが存在しなかったため移行できませんでした。';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません。--env-file を指定してください。');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  console.log(`接続先: ${url}  モード: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const { data: terms, error } = await supabase
    .from('com_m_terms')
    .select('term_id, term_type, version_name, storage_path, com_m_terms_revision(revision_id)')
    .order('term_type')
    .order('published_date');
  if (error) throw error;

  let migrated = 0;
  let skipped = 0;
  const failures = [];

  for (const term of terms ?? []) {
    const label = `${term.term_type} ${term.version_name} (${term.term_id})`;

    if (term.com_m_terms_revision.length > 0) {
      console.log(`SKIP  ${label}: リビジョン登録済み`);
      skipped++;
      continue;
    }
    if (!term.storage_path) {
      failures.push(`${label}: storage_path が空でリビジョンもありません`);
      continue;
    }

    const path = term.storage_path.replace(/^\/+/, '');
    const { data: file, error: dlError } = await supabase.storage.from(BUCKET).download(path);
    let content;
    let changeNote = CHANGE_NOTE;
    if (dlError || !file) {
      if (!PLACEHOLDER_MISSING) {
        failures.push(`${label}: Storageからの取得に失敗 (${path}) ${dlError?.message ?? ''}`);
        continue;
      }
      console.warn(`WARN  ${label}: 本文ファイルが存在しないため注記のみ登録します (${path})`);
      content = MISSING_CONTENT;
      changeNote = MISSING_CHANGE_NOTE;
    } else {
      content = await file.text();
    }
    if (!content.trim()) {
      failures.push(`${label}: 本文ファイルが空です (${path})`);
      continue;
    }

    if (!APPLY) {
      console.log(`PLAN  ${label}: ${path} (${content.length}文字) をリビジョン1として登録`);
      migrated++;
      continue;
    }

    const { error: insError } = await supabase.from('com_m_terms_revision').insert({
      term_id: term.term_id,
      revision_no: 1,
      content,
      change_note: changeNote,
    });
    if (insError) {
      failures.push(`${label}: 登録に失敗 ${insError.message}`);
      continue;
    }
    console.log(`DONE  ${label}: ${path} (${content.length}文字)`);
    migrated++;
  }

  console.log(`\n${APPLY ? '登録' : '登録予定'}: ${migrated}件 / スキップ: ${skipped}件 / 失敗: ${failures.length}件`);
  if (failures.length > 0) {
    failures.forEach((f) => console.error(`FAIL  ${f}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
