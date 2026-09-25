/**
 * 要確認台帳（docs/cv-dictionary/review-ledger.tsv）の操作。
 *
 * 使い方:
 *   # validate.ts が出力した review.tsv のうち、台帳に未登録の行を「pending」で追記する
 *   npx tsx .claude/skills/cv-dictionary-tsv/scripts/ledger.ts sync --work <作業ディレクトリ> [--ledger <台帳TSV>]
 *
 *   # 確定（confirmed）行を、CV辞書 一括登録用のTSVとして書き出す（取込画面で「既存も上書き」を選んで反映）
 *   # （word_ja・lemma は --dict で指定した生成済みの辞書TSVから引く。--since で確定日を絞り込める）
 *   npx tsx .claude/skills/cv-dictionary-tsv/scripts/ledger.ts export --out <出力TSV> --dict <辞書TSV> [--since <YYYY-MM-DD>] [--ledger <台帳TSV>]
 *
 *   # 状態・分類ごとの件数を表示する
 *   npx tsx .claude/skills/cv-dictionary-tsv/scripts/ledger.ts status [--ledger <台帳TSV>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  CV_IMPORT_REQUIRED_HEADERS,
  CV_IMPORT_OPTIONAL_HEADERS,
} from '../../../../apps/admin/lib/cvDictionaryImport';
import {
  DEFAULT_LEDGER_PATH,
  type LedgerRow,
  readLedger,
  writeLedger,
  ledgerKey,
  classifyQuestion,
  nextLedgerId,
  today,
} from './ledgerLib';

const [command, ...args] = process.argv.slice(2);
const argOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
};
const ledgerPath = argOf('--ledger') || DEFAULT_LEDGER_PATH;
const ledger = readLedger(ledgerPath);

// ------------------------------------------------------------
// sync: review.tsv → 台帳（pending で追記）
// ------------------------------------------------------------
const sync = () => {
  const workDir = argOf('--work');
  if (!workDir) throw new Error('--work を指定してください');

  const lines = readFileSync(join(workDir, 'review.tsv'), 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const headers = lines[0].split('\t');
  const existing = new Set(ledger.map(ledgerKey));
  const source = basename(workDir.replace(/[\\/]+$/, ''));
  let added = 0;

  for (const line of lines.slice(1)) {
    const cells = line.split('\t');
    const r = Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
    // 台帳で確認済み・確認待ちの注記だけの行は追記対象外
    const question = r.review.split(' / ').filter((q: string) => !q.startsWith('台帳')).join(' / ');
    if (!question || existing.has(ledgerKey(r as LedgerRow))) continue;

    const row: LedgerRow = {
      id: nextLedgerId(ledger),
      status: 'pending',
      category: classifyQuestion(question),
      word_en: r.word_en,
      part_of_speech: r.part_of_speech,
      syllables: r.syllables,
      primary_stress_syllable: r.primary_stress_syllable,
      stress_vowel_spelling: r.stress_vowel_spelling,
      cv_id: r.cv_id,
      phonetic_spelling: r.phonetic_spelling,
      question,
      decision_note: '',
      decided_by: '',
      decided_date: '',
      registered_date: today(),
      source,
    };
    ledger.push(row);
    existing.add(ledgerKey(row));
    added++;
  }

  writeLedger(ledgerPath, ledger);
  console.log(`台帳に追記: ${added}件（台帳合計 ${ledger.length}件） → ${ledgerPath}`);
};

// ------------------------------------------------------------
// export: confirmed 行 → 一括登録TSV
// ------------------------------------------------------------
const exportConfirmed = () => {
  const outPath = argOf('--out');
  if (!outPath) throw new Error('--out を指定してください');
  const since = argOf('--since');

  const rows = ledger.filter((r) => r.status === 'confirmed' && (!since || r.decided_date >= since));
  const headers = [...CV_IMPORT_REQUIRED_HEADERS, ...CV_IMPORT_OPTIONAL_HEADERS];
  // word_ja・lemma は台帳で管理しないため、--dict で指定した生成済みの辞書TSVから引く
  const dictPath = argOf('--dict');
  if (!dictPath) throw new Error('--dict に word_ja の参照元となる辞書TSV（生成済みの一括登録TSV）を指定してください');
  const dictLines = readFileSync(dictPath, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const dictHeaders = dictLines[0].split('\t');
  const dict = new Map(
    dictLines.slice(1).map((l) => {
      const c = l.split('\t');
      const rec = Object.fromEntries(dictHeaders.map((h, i) => [h, c[i] ?? '']));
      return [ledgerKey(rec as LedgerRow), { wordJa: rec.word_ja, lemma: rec.lemma ?? '' }];
    })
  );

  const missing = rows.filter((r) => !dict.get(ledgerKey(r))?.wordJa);
  if (missing.length > 0) {
    throw new Error(`辞書TSVに word_ja が見つからない行があります: ${missing.map((r) => `${r.id} ${r.word_en}`).join(', ')}`);
  }

  const body = rows.map((r) => {
    const d = dict.get(ledgerKey(r));
    return [r.word_en, r.part_of_speech, d?.wordJa, r.syllables, r.primary_stress_syllable, r.stress_vowel_spelling, r.cv_id, r.phonetic_spelling, d?.lemma].join('\t');
  });
  writeFileSync(outPath, [headers.join('\t'), ...body].join('\n') + '\n', 'utf-8');
  console.log(`確定行 ${rows.length}件 → ${outPath}（取込画面で「既存も上書き」を選んで反映してください）`);
};

// ------------------------------------------------------------
// status: 件数の集計
// ------------------------------------------------------------
const status = () => {
  const counts = new Map<string, number>();
  for (const r of ledger) {
    const key = `${r.status}\t${r.category}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log(`台帳: ${ledger.length}件（${ledgerPath}）`);
  for (const [key, n] of [...counts.entries()].sort()) console.log(`  ${key.replace('\t', ' / ')}: ${n}件`);
};

const commands: Record<string, () => void> = { sync, export: exportConfirmed, status };
if (!commands[command]) {
  console.error('Usage: ledger.ts <sync|export|status> ...');
  process.exit(1);
}
commands[command]();
