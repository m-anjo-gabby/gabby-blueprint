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
 * Web Speech APIの認識結果に対する前処理パイプライン。
 * 1. 口語短縮形を展開して複数単語に戻す
 * 2. フィラーを除去する
 * 3. 直前と同じ単語の連続（言い直し）を1つにまとめる
 *
 * analyzePhrase本体のマッチングロジックには手を加えず、入力側だけを正規化することで、
 * 各施策を独立に追加・調整できるようにしている。
 */
export function preprocessInputWords(rawInputWords: string[]): string[] {
  const expanded = rawInputWords.flatMap(w => CONTRACTIONS[w] ?? [w]);
  const withoutFillers = expanded.filter(w => !FILLER_WORDS.has(w));
  return collapseRepeats(withoutFillers);
}
