/**
 * スプリント一括登録TSVから、CV辞書登録用の単語ワークリストを作成する。
 *
 * 使い方:
 *   npx tsx .claude/skills/cv-dictionary-tsv/scripts/extract.ts --out <作業ディレクトリ> [--exclude <辞書TSV>]... <スプリントTSV>...
 *
 * 出力（<作業ディレクトリ>配下）:
 *   worklist.tsv … 辞書化対象の単語（word / count / note / contexts）
 *   excluded.tsv … 機械的に除外した単語と理由（固有名詞・数字のみ・除外ファイル掲載語）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// 対象列（ステートメント・質問/指示・解答文）
const SOURCE_COLUMNS = ['statement_en', 'question_en', 'answer_sentence_yes_en', 'answer_sentence_no_en'];

// 生徒アプリ LookupText.tsx と同じ単語分割・記号除去ルール
const WORD_REGEX = /([a-zA-Z0-9'-]+)|([^a-zA-Z0-9'-]+)/g;
const EDGE_PUNCT = /^[.,!?;:"'()]+|[.,!?;:"'()]+$/g;
const MAX_CONTEXTS = 3;

// 大文字始まりでも学習語彙として辞書化する語（曜日・月名）
const CAPITALIZED_VOCAB = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);

interface WordStat {
  count: number;
  forms: Set<string>;
  hasLowercase: boolean;
  capitalizedMidSentence: boolean;
  contexts: Set<string>;
}

// ------------------------------------------------------------
// 引数
// ------------------------------------------------------------
const args = process.argv.slice(2);
let outDir = '';
const excludeFiles: string[] = [];
const inputs: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') outDir = args[++i];
  else if (args[i] === '--exclude') excludeFiles.push(args[++i]);
  else inputs.push(args[i]);
}
if (!outDir || inputs.length === 0) {
  console.error('Usage: extract.ts --out <dir> [--exclude <dict.tsv>]... <sprint.tsv>...');
  process.exit(1);
}

const readTsv = (path: string): Record<string, string>[] => {
  const lines = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const headers = lines[0].split('\t').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]?.trim() ?? '']));
  });
};

// ------------------------------------------------------------
// 抽出
// ------------------------------------------------------------
const stats = new Map<string, WordStat>();

for (const path of inputs) {
  const rows = readTsv(path);
  const missing = SOURCE_COLUMNS.filter((c) => !(c in (rows[0] ?? {})));
  if (missing.length > 0) {
    console.error(`[WARN] ${path}: 列が見つかりません: ${missing.join(', ')}`);
  }

  for (const row of rows) {
    for (const col of SOURCE_COLUMNS) {
      const text = row[col];
      if (!text) continue;

      let sentenceStart = true;
      for (const m of text.matchAll(WORD_REGEX)) {
        if (m[2]) {
          if (/[.!?]/.test(m[2])) sentenceStart = true;
          continue;
        }
        const word = m[1].replace(EDGE_PUNCT, '');
        if (!/[a-zA-Z0-9]/.test(word)) continue;

        const key = word.toLowerCase();
        const stat = stats.get(key) ?? {
          count: 0, forms: new Set<string>(), hasLowercase: false, capitalizedMidSentence: false, contexts: new Set<string>(),
        };
        stat.count++;
        stat.forms.add(word);
        if (!/^[A-Z]/.test(word)) stat.hasLowercase = true;
        else if (!sentenceStart) stat.capitalizedMidSentence = true;
        stat.contexts.add(text);
        stats.set(key, stat);
        sentenceStart = false;
      }
    }
  }
}

const excludeKeys = new Set<string>();
for (const path of excludeFiles) {
  for (const row of readTsv(path)) if (row.word_en) excludeKeys.add(row.word_en.toLowerCase());
}

// ------------------------------------------------------------
// 分類
// ------------------------------------------------------------
const work: string[][] = [];
const excluded: string[][] = [];

for (const [key, s] of [...stats.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const forms = [...s.forms];
  const isPronounI = key === 'i' || key.startsWith("i'");
  const isCapitalizedVocab = CAPITALIZED_VOCAB.has(key) && !s.hasLowercase;
  // 大文字を2文字以上含む語は略語（CEO, ESG, KPIs）として出現形のまま辞書化する
  const isAbbreviation = !isPronounI && forms.every((f) => (f.match(/[A-Z]/g)?.length ?? 0) >= 2);
  let reason = '';
  if (/^[0-9]+$/.test(key)) reason = 'digits';
  else if (excludeKeys.has(key)) reason = 'already_in_exclude_file';
  else if (!isPronounI && !isAbbreviation && !isCapitalizedVocab && !s.hasLowercase && s.capitalizedMidSentence) reason = 'proper_noun';

  if (reason) {
    excluded.push([forms[0], reason, String(s.count)]);
    continue;
  }

  const note = isAbbreviation
    ? 'abbreviation'
    : !isPronounI && !isCapitalizedVocab && !s.hasLowercase ? 'capitalized_sentence_initial_only' : '';
  const word = isPronounI ? key.replace(/^i/, 'I') : isAbbreviation || isCapitalizedVocab ? forms[0] : key;
  const contexts = [...s.contexts].sort((a, b) => a.length - b.length).slice(0, MAX_CONTEXTS);
  work.push([word, String(s.count), note, contexts.join(' || ')]);
}

mkdirSync(join(outDir, 'parts'), { recursive: true });
writeFileSync(
  join(outDir, 'worklist.tsv'),
  ['word\tcount\tnote\tcontexts', ...work.map((r) => r.join('\t'))].join('\n') + '\n',
  'utf-8'
);
writeFileSync(
  join(outDir, 'excluded.tsv'),
  ['word\treason\tcount', ...excluded.map((r) => r.join('\t'))].join('\n') + '\n',
  'utf-8'
);

console.log(`入力ファイル: ${inputs.length}件`);
console.log(`辞書化対象: ${work.length}語 → ${join(outDir, 'worklist.tsv')}`);
console.log(`除外: ${excluded.length}語 → ${join(outDir, 'excluded.tsv')}`);
for (const r of excluded) console.log(`  - ${r[0]} (${r[1]})`);
