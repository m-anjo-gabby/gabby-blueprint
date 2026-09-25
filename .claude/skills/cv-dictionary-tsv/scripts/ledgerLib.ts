/**
 * 要確認台帳（docs/cv-dictionary/review-ledger.tsv）の読み書き。validate.ts / ledger.ts で共通使用する。
 * コンテンツチームがExcelで開けるよう、UTF-8（BOM付き）のTSVで保存する。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { type CVImportEntry, toCVEntryKey } from '../../../../apps/admin/lib/cvDictionaryImport';

export const DEFAULT_LEDGER_PATH = 'docs/cv-dictionary/review-ledger.tsv';

export const LEDGER_HEADERS = [
  'id',
  'status',
  'category',
  'word_en',
  'part_of_speech',
  'syllables',
  'primary_stress_syllable',
  'stress_vowel_spelling',
  'cv_id',
  'phonetic_spelling',
  'question',
  'decision_note',
  'decided_by',
  'decided_date',
  'registered_date',
  'source',
] as const;

type LedgerHeader = (typeof LEDGER_HEADERS)[number];
export type LedgerRow = Record<LedgerHeader, string>;

/** pending: コンテンツチーム確認待ち / confirmed: 確定（この行の値が正） */
export type LedgerStatus = 'pending' | 'confirmed';

export const ledgerKey = (row: Pick<LedgerRow, 'word_en' | 'part_of_speech'>): string =>
  toCVEntryKey(row.word_en, row.part_of_speech);

export const readLedger = (path: string): LedgerRow[] => {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const headers = lines[0].split('\t').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(LEDGER_HEADERS.map((h) => [h, cells[headers.indexOf(h)]?.trim() ?? ''])) as LedgerRow;
  });
};

export const writeLedger = (path: string, rows: LedgerRow[]): void => {
  const body = rows.map((r) => LEDGER_HEADERS.map((h) => r[h].replace(/[\t\r\n]/g, ' ')).join('\t'));
  writeFileSync(path, '\uFEFF' + [LEDGER_HEADERS.join('\t'), ...body].join('\r\n') + '\r\n', 'utf-8');
};

/** 台帳の確定値と生成データが一致するか（word_ja は判定対象外） */
export const matchesLedger = (row: LedgerRow, e: CVImportEntry): boolean =>
  row.syllables === e.syllables &&
  Number(row.primary_stress_syllable) === e.primary_stress_syllable &&
  row.stress_vowel_spelling === e.stress_vowel_spelling &&
  row.cv_id === e.cv_id &&
  row.phonetic_spelling === (e.phonetic_spelling ?? '');

/** 確認事項の文面から分類を付ける（コンテンツチームが分類単位でまとめて判断できるように） */
export const classifyQuestion = (question: string): string => {
  if (/\/(ɛr|ɪr|ʊr)\//.test(question)) return 'R音化母音';
  if (/音節目にアクセント/.test(question)) return 'アクセント位置の揺れ';
  if (/も一般的/.test(question)) return '発音の揺れ';
  if (/想定されます/.test(question)) return 'IPAとcv_idの不一致';
  return 'その他';
};

export const nextLedgerId = (rows: LedgerRow[]): string => {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.id.replace(/^CVR-/, '')) || 0), 0);
  return `CVR-${String(max + 1).padStart(4, '0')}`;
};

export const today = (): string => new Date().toISOString().slice(0, 10);
