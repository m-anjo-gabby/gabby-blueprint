// packages/lib/assessment/inputNormalization.ts

/**
 * 口語的な短縮形と、展開後の複数単語のマッピング。
 * ターゲットフレーズが複数単語（例: "want to"）でも、実際の発話はブラウザのASRによって
 * 短縮形1語（例: "wanna"）として認識されることがあるため、展開してから通常の単語として
 * マッチングできるようにする。
 * 新しい短縮形を追加する場合はこのテーブルに1件足すだけでよい。
 */
const CONTRACTIONS: Record<string, string[]> = {
  wanna: ['want', 'to'],
  gonna: ['going', 'to'],
  gotta: ['got', 'to'],
  gimme: ['give', 'me'],
  lemme: ['let', 'me'],
  kinda: ['kind', 'of'],
  sorta: ['sort', 'of'],
  outta: ['out', 'of'],
  lotta: ['lot', 'of'],
  dunno: ["don't", 'know'],
};

/**
 * 発話中のフィラー（言い淀み）。マッチング対象から除外することで、
 * 「um, uh」等がCOMBINED救済やスコア計算に不要に混入するのを防ぐ。
 * 新しいフィラーを追加する場合はこのSetに1件足すだけでよい。
 */
const FILLER_WORDS = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah']);

function collapseRepeats(words: string[]): string[] {
  return words.filter((w, i) => i === 0 || w !== words[i - 1]);
}

/**
 * マイク入力の音声認識結果には、文末のピリオドなど発話として存在しない句読点が
 * ブラウザ/OSのASR実装依存で付与されることがある。ターゲット側（analyzePhrase内のtLower）は
 * 同じ記号セットを除去した上で比較しているため、入力側だけ除去しないと
 * 「完全一致のはずがFUZZY扱いになりスコアが下がる」という不整合が起きる。
 * ここで除去する記号セットは native-speech.ts の各所（calculateSimilarity等）と揃えている
 * （アポストロフィは "don't" 等の短縮形を壊さないよう対象外）。
 */
const normalizeWord = (word: string): string =>
  word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");

/**
 * Web Speech APIの認識結果に対する前処理パイプライン。
 * 1. 句読点を除去する（ASR依存で付与される記号による誤判定を防ぐ）
 * 2. 口語短縮形を展開して複数単語に戻す
 * 3. フィラーを除去する
 * 4. 直前と同じ単語の連続（言い直し）を1つにまとめる
 *
 * analyzePhrase本体のマッチングロジックには手を加えず、入力側だけを正規化することで、
 * 各施策を独立に追加・調整できるようにしている。
 */
export function preprocessInputWords(rawInputWords: string[]): string[] {
  const normalized = rawInputWords.map(normalizeWord).filter(w => w.length > 0);
  const expanded = normalized.flatMap(w => CONTRACTIONS[w] ?? [w]);
  const withoutFillers = expanded.filter(w => !FILLER_WORDS.has(w));
  return collapseRepeats(withoutFillers);
}
