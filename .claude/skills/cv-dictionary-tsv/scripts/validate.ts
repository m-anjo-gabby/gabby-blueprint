/**
 * parts/*.tsv（Claudeが生成した辞書データ）を結合・検証し、CV辞書 一括登録用のTSVを出力する。
 *
 * 使い方:
 *   npx tsx .claude/skills/cv-dictionary-tsv/scripts/validate.ts --work <作業ディレクトリ> --out <出力TSV> [--ledger <台帳TSV>]
 *
 * - エラー（取込不可・ワークリストの取りこぼし）があれば終了コード1。出力TSVは書き出さない
 * - 警告（音節綴り・IPAとcv_idの不一致・原形とのcv_idの不一致など）は review.tsv に出力し、人が確認する
 * - 行検証は取込画面と同じ apps/admin/lib/cvDictionaryImport.ts を使用する
 * - 要確認台帳（docs/cv-dictionary/review-ledger.tsv）で確定済みの語は、確定値と異なればエラー。
 *   確定値どおりなら要確認から外し、確認待ちの語は台帳IDを添えて要確認に残す
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CV_IMPORT_REQUIRED_HEADERS,
  CV_IMPORT_OPTIONAL_HEADERS,
  type CVImportEntry,
  normalizeCVImportRow,
  validateCVImportEntry,
  isSameCVImportEntry,
  toCVEntryKey,
} from '../../../../apps/admin/lib/cvDictionaryImport';
import { DEFAULT_LEDGER_PATH, type LedgerRow, readLedger, ledgerKey, matchesLedger } from './ledgerLib';

const OUTPUT_HEADERS = [...CV_IMPORT_REQUIRED_HEADERS, ...CV_IMPORT_OPTIONAL_HEADERS];

// IPAのアクセント母音 → cv_id（長いものから順に照合）
const IPA_TO_CV: Array<[string, string]> = [
  ['ɔːr', 'orange_door'], ['ɔr', 'orange_door'],
  ['ɑːr', 'olive_sock'], ['ɑr', 'olive_sock'],
  ['ɜːr', 'purple_shirt'], ['ɜr', 'purple_shirt'], ['ɝ', 'purple_shirt'], ['ɜː', 'purple_shirt'], ['ɜ', 'purple_shirt'],
  ['ɔɪ', 'turquoise_toy'], ['aɪ', 'white_tie'], ['aʊ', 'brown_cow'], ['eɪ', 'gray_day'],
  ['oʊ', 'rose_boat'], ['əʊ', 'rose_boat'],
  ['iː', 'green_tea'], ['i', 'green_tea'], ['uː', 'blue_moon'], ['u', 'blue_moon'],
  ['ɪ', 'silver_pin'], ['ɛ', 'red_pepper'], ['e', 'red_pepper'], ['æ', 'black_cat'],
  ['ʌ', 'cup_of_mustard'], ['ə', 'cup_of_mustard'],
  ['ɑː', 'olive_sock'], ['ɑ', 'olive_sock'], ['ɒ', 'olive_sock'],
  ['ɔː', 'auburn_dog'], ['ɔ', 'auburn_dog'], ['ʊ', 'wooden_hook'],
];
const IPA_VOWEL_CHARS = /[iɪeɛæaɑɒɔoʊuʌəɜɝ]/;
// R音化の曖昧なケース（here / hair / tour 等）は判定しない
const AMBIGUOUS_R = /^[ɪɛeʊ]ː?r/;

interface Row {
  source: string;
  entry: CVImportEntry;
  reviewNote: string;
}

// ------------------------------------------------------------
// 引数
// ------------------------------------------------------------
const args = process.argv.slice(2);
const argOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
};
const workDir = argOf('--work');
const outPath = argOf('--out');
const ledgerPath = argOf('--ledger') || DEFAULT_LEDGER_PATH;
if (!workDir || !outPath) {
  console.error('Usage: validate.ts --work <dir> --out <file.tsv>');
  process.exit(1);
}

const readTsv = (path: string): { headers: string[]; rows: string[][] } => {
  const lines = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  return { headers: lines[0].split('\t').map((h) => h.trim()), rows: lines.slice(1).map((l) => l.split('\t')) };
};

// ------------------------------------------------------------
// チェック関数
// ------------------------------------------------------------

/** IPAのアクセント母音から期待されるcv_id（判定不能ならnull） */
const expectedCvFromIpa = (ipa: string): string | null => {
  const body = ipa.replace(/^\/|\/$/g, '');
  const stressIdx = body.indexOf('ˈ');
  const tail = stressIdx >= 0 ? body.slice(stressIdx + 1) : body;
  const vowelIdx = tail.search(IPA_VOWEL_CHARS);
  if (vowelIdx < 0) return null;
  const nucleus = tail.slice(vowelIdx);
  if (AMBIGUOUS_R.test(nucleus)) return null;
  return IPA_TO_CV.find(([ipaVowel]) => nucleus.startsWith(ipaVowel))?.[1] ?? null;
};

const collectWarnings = (e: CVImportEntry): string[] => {
  const warnings: string[] = [];
  const letters = (s: string) => s.toLowerCase().replace(/-/g, '');
  if (letters(e.syllables) !== letters(e.word_en)) warnings.push(`syllables「${e.syllables}」の綴りが単語と一致しません`);

  const ipa = e.phonetic_spelling;
  if (!ipa) {
    warnings.push('phonetic_spelling が空です');
    return warnings;
  }
  if (!/^\/.+\/$/.test(ipa)) warnings.push('phonetic_spelling が /…/ で囲まれていません');
  const syllableCount = e.syllables.split('-').length;
  if (syllableCount >= 2 && !ipa.includes('ˈ')) warnings.push('複数音節ですがIPAに第一アクセント記号 ˈ がありません');

  const expected = expectedCvFromIpa(ipa);
  if (expected && expected !== e.cv_id) warnings.push(`IPAのアクセント母音からは ${expected} が想定されます（cv_id: ${e.cv_id}）`);
  return warnings;
};

// ------------------------------------------------------------
// 読み込み
// ------------------------------------------------------------
const errors: string[] = [];
const review: string[][] = [];

const worklist = readTsv(join(workDir, 'worklist.tsv')).rows.map((r) => r[0]);
const skippedPath = join(workDir, 'skipped.tsv');
const skipped = existsSync(skippedPath) ? readTsv(skippedPath).rows.map((r) => r[0].toLowerCase()) : [];

const partsDir = join(workDir, 'parts');
const partFiles = readdirSync(partsDir).filter((f) => f.endsWith('.tsv')).sort();
const rows: Row[] = [];

for (const file of partFiles) {
  const { headers, rows: raw } = readTsv(join(partsDir, file));
  const missing = OUTPUT_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    errors.push(`${file}: ヘッダー不足 ${missing.join(', ')}`);
    continue;
  }
  raw.forEach((cells, i) => {
    const source = `${file}:${i + 2}`;
    if (cells.length !== headers.length) {
      errors.push(`${source}: 列数が不正です（${cells.length}列 / 期待値 ${headers.length}列）`);
      return;
    }
    const record = Object.fromEntries(headers.map((h, j) => [h, cells[j]]));
    const entry = normalizeCVImportRow(record);
    const code = validateCVImportEntry(entry);
    if (code) {
      errors.push(`${source}: ${entry.word_en} (${entry.part_of_speech}) ${code}`);
      return;
    }
    rows.push({ source, entry, reviewNote: record.review_note?.trim() ?? '' });
  });
}

// ------------------------------------------------------------
// 重複・網羅性チェック
// ------------------------------------------------------------
const byKey = new Map<string, Row>();
for (const row of rows) {
  const key = toCVEntryKey(row.entry.word_en, row.entry.part_of_speech);
  const first = byKey.get(key);
  if (!first) {
    byKey.set(key, row);
  } else if (!isSameCVImportEntry(first.entry, row.entry)) {
    errors.push(`${row.source}: ${row.entry.word_en} (${row.entry.part_of_speech}) が ${first.source} と重複し内容が異なります`);
  }
}

const coveredWords = new Set([...byKey.values()].map((r) => r.entry.word_en.toLowerCase()));
const worklistKeys = new Set(worklist.map((w) => w.toLowerCase()));
const uncovered = worklist.filter((w) => !coveredWords.has(w.toLowerCase()) && !skipped.includes(w.toLowerCase()));
if (uncovered.length > 0) errors.push(`未生成の単語 ${uncovered.length}語: ${uncovered.join(', ')}`);

const ledgerByKey = new Map<string, LedgerRow>(readLedger(ledgerPath).map((r) => [ledgerKey(r), r]));

// 規則変化の語尾（原形 → 見出し語）。不規則変化（began, sold 等）は母音が変わるのが正しいため照合しない
const REGULAR_SUFFIXES: Array<[string, string]> = [
  ['', "'s"], ['', 's'], ['', 'es'], ['', 'ed'], ['', 'd'], ['', 'ing'], ['e', 'ing'], ['y', 'ies'], ['y', 'ied'],
];

// 綴りは規則変化でも発音が変わる語
const IRREGULAR_PRONUNCIATION = new Set(['does', 'says', 'said']);

const isRegularInflection = (word: string, lemma: string): boolean => {
  const w = word.toLowerCase();
  const l = lemma.toLowerCase();
  if (IRREGULAR_PRONUNCIATION.has(w)) return false;
  const doubled = l + l.slice(-1);
  return REGULAR_SUFFIXES.some(([drop, suffix]) => (drop === '' || l.endsWith(drop)) && w === l.slice(0, l.length - drop.length) + suffix)
    || w === `${doubled}ed` || w === `${doubled}ing`;
};

/** 規則変化の行が、同じ原形・同じ品詞の行（原形の行）と Color Vowel で食い違っていないか */
const lemmaWarning = (e: CVImportEntry): string | null => {
  if (!e.lemma || !isRegularInflection(e.word_en, e.lemma)) return null;
  const base = byKey.get(toCVEntryKey(e.lemma, e.part_of_speech))?.entry;
  if (!base || base.cv_id === e.cv_id) return null;
  return `原形 ${base.word_en}（${base.part_of_speech}）の cv_id（${base.cv_id}）と異なります`;
};

for (const row of byKey.values()) {
  const ledgerRow = ledgerByKey.get(toCVEntryKey(row.entry.word_en, row.entry.part_of_speech));
  if (ledgerRow?.status === 'confirmed') {
    if (!matchesLedger(ledgerRow, row.entry)) {
      errors.push(`${row.source}: ${row.entry.word_en} (${row.entry.part_of_speech}) が台帳 ${ledgerRow.id} の確定値と異なります（${ledgerRow.cv_id} ${ledgerRow.phonetic_spelling}）`);
    }
    continue;
  }

  const lemmaNote = lemmaWarning(row.entry);
  const notes = [...(row.reviewNote ? [row.reviewNote] : []), ...collectWarnings(row.entry), ...(lemmaNote ? [lemmaNote] : [])];
  if (!worklistKeys.has(row.entry.word_en.toLowerCase())) notes.push('ワークリストにない単語です');
  if (ledgerRow) notes.push(`台帳 ${ledgerRow.id}（確認待ち）`);
  if (notes.length > 0) {
    const e = row.entry;
    review.push([e.word_en, e.part_of_speech, e.word_ja, e.syllables, String(e.primary_stress_syllable), e.stress_vowel_spelling, e.cv_id, e.phonetic_spelling ?? '', e.lemma ?? '', notes.join(' / '), row.source]);
  }
}

// ------------------------------------------------------------
// 出力
// ------------------------------------------------------------
console.log(`parts: ${partFiles.length}ファイル / 有効行: ${byKey.size}件 / ワークリスト: ${worklist.length}語 / skipped: ${skipped.length}語`);

writeFileSync(
  join(workDir, 'review.tsv'),
  [[...OUTPUT_HEADERS, 'review', 'source'].join('\t'), ...review.map((r) => r.join('\t'))].join('\n') + '\n',
  'utf-8'
);
console.log(`要確認: ${review.length}件 → ${join(workDir, 'review.tsv')}`);

if (errors.length > 0) {
  console.error(`\nエラー: ${errors.length}件（出力TSVは作成していません）`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const sorted = [...byKey.values()]
  .map((r) => r.entry)
  .sort((a, b) => a.word_en.toLowerCase().localeCompare(b.word_en.toLowerCase()) || a.part_of_speech.localeCompare(b.part_of_speech));
const body = sorted.map((e) =>
  [e.word_en, e.part_of_speech, e.word_ja, e.syllables, e.primary_stress_syllable, e.stress_vowel_spelling, e.cv_id, e.phonetic_spelling ?? '', e.lemma ?? ''].join('\t')
);
writeFileSync(outPath, [OUTPUT_HEADERS.join('\t'), ...body].join('\n') + '\n', 'utf-8');
console.log(`\n出力: ${sorted.length}件 → ${outPath}`);
