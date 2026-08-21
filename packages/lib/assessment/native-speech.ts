// packages/lib/assessment/native-speech.ts
import { AnalysisResult, WordMatch } from '@gabby/types/speechAssessment';
import { getScoreTier, ScoreTier } from './feedbackConfig';
import { detectPhoneticConfusion, PhoneticConfusionRule } from './phoneticConfusions';
import { preprocessInputWords } from './inputNormalization';

// 重みの定義
const WEIGHTS = {
  EXACT: 1.0,
  COMBINED: 0.8,
  FUZZY: 0.6,
  MISSING: 0.0,
  MAIN_WORD_MULTIPLIER: 1.5,
};

// excellent/great帯で、指摘(issues)が全く無い場合にのみ使う手放しの称賛コメント。
// 判定結果に差が無い場面でのみ使う表現のバリエーションなので、ランダム選出で問題ない。
const PRAISE_COMMENTS: Record<'excellent' | 'great', string[]> = {
  excellent: [
    "非常に明瞭で正確な発音です。この高い基準を維持しましょう。",
    "完璧なリズムと流暢さです。自信を持って活用してください。",
    "素晴らしいパフォーマンスです。今の感覚をぜひ定着させましょう。",
  ],
  great: [
    "全体的にとても良い発音です。この調子で続けましょう。",
    "自然なリズムで発音できています。自信を持って次に進みましょう。",
  ],
};

// excellent/great帯だが、非メイン単語のFUZZY/COMBINED等が1つでも残っている場合の称賛コメント。
// 長文では些細な1語の乱れがあってもスコアが高くなり得るため、「完璧」と言い切らず、
// 詳細はissues側に譲ることを明示する。
const PRAISE_WITH_MINOR_NOTE: Record<'excellent' | 'great', string[]> = {
  excellent: [
    "全体的に非常に高いレベルの発話です。細かい点はアドバイス欄も確認してみましょう。",
    "ほぼ完璧な仕上がりです。さらに磨きたい方はアドバイスもチェックしてみてください。",
  ],
  great: [
    "全体的にとても良い発音です。気になる点はアドバイス欄で確認できます。",
    "自然な発音で伝わっています。さらに良くしたい部分はアドバイスを参考にしてください。",
  ],
};

// メインコメント(summary)で、事実の診断文の後に添える一言（good/fair/poor帯のみ使用）。
// 「どう直すか」の具体策はissues側の役割なので、ここではモチベーション維持のための短い言葉に留める。
const ENCOURAGEMENT_BY_TIER: Record<Exclude<ScoreTier, 'excellent' | 'great'>, string[]> = {
  good: ["練習を重ねれば、さらに伝わりやすくなります。", "この調子で続けていきましょう。"],
  fair: ["焦らず、繰り返し練習していきましょう。", "反復すれば必ず慣れてきます。"],
  poor: ["諦めず、もう一度チャレンジしてみましょう。", "反復練習で必ず上達します。"],
};

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * 2つの文字列の類似度を計算 (Levenshtein距離ベース)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();
  const s2 = str2.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0;

  const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }

  const distance = track[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return (maxLength - distance) / maxLength;
}

/**
 * 単語レベルでのファジー判定 (内部用)
 */
function checkFuzzy(target: string, input: string): boolean {
  const t = target.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
  const i = input.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
  const threshold = t.length > 3 ? 0.70 : 0.85;
  return calculateSimilarity(t, i) >= threshold;
}

/**
 * フレーズの解析を行い、詳細なマッチング結果を返す
 */
export function analyzePhrase(input: string, target: string, mainWords: string[] = []): AnalysisResult {
  // 口語短縮形の展開・フィラー除去・言い直しの統合を行ってからマッチングにかける
  const rawInputWords = preprocessInputWords(
    input.toLowerCase().split(/\s+/).filter(w => w.length > 0)
  );
  const targetWords = target.split(/\s+/).filter(w => w.length > 0);

  // 【忖度用データ準備】隣接する単語を結合したリストを作成(元のインデックスを保持)
  const inputWordsWithCombined = [...rawInputWords];
  for (let i = 0; i < rawInputWords.length - 1; i++) {
    inputWordsWithCombined.push(rawInputWords[i] + " " + rawInputWords[i+1]); 
  }

  const matches: WordMatch[] = targetWords.map(tWord => {
    const tLower = tWord.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");

    // 1. 完全一致 (理想的な結果)
    if (rawInputWords.includes(tLower)) {
      return { word: tWord, isMatch: true, isFuzzy: false, isCombined: false, heard: tLower };
    }

    // 2. 単語結合による一致 (filter + rate = filtrate などを救済)
    const combinedMatch = inputWordsWithCombined.find(iWord => 
      iWord.replace(/\s+/g, "") === tLower || checkFuzzy(tLower, iWord.replace(/\s+/g, ""))
    );
    if (combinedMatch && combinedMatch.includes(" ")) {
      return { word: tWord, isMatch: true, isFuzzy: false, isCombined: true, heard: combinedMatch };
    }

    // 3. 単体ワードでのファジー一致 (L/Rなどの発音ミス)
    const fuzzyMatch = rawInputWords.find(iWord => checkFuzzy(tLower, iWord));
    if (fuzzyMatch) {
      return { word: tWord, isMatch: true, isFuzzy: true, isCombined: false, heard: fuzzyMatch };
    }

    // 4. 不一致 (heardを空文字にして型を合わせる)
    return { word: tWord, isMatch: false, isFuzzy: false, isCombined: false, heard: "" };
  });

  // スコア算出
  const totalScore = matches.reduce((acc, m) => {
    let wordScore = WEIGHTS.MISSING;
    if (m.isMatch) {
      if (m.isFuzzy) wordScore = WEIGHTS.FUZZY;
      else if (m.isCombined) wordScore = WEIGHTS.COMBINED;
      else wordScore = WEIGHTS.EXACT;
    }

    const isMain = mainWords.some(mw => mw.toLowerCase() === m.word.toLowerCase());
    const weight = isMain ? WEIGHTS.MAIN_WORD_MULTIPLIER : 1.0;
    
    return acc + (wordScore * weight);
  }, 0);

  // 最大スコア
  const maxPossibleScore = targetWords.reduce((acc, word) => {
    const isMain = mainWords.some(mw => mw.toLowerCase() === word.toLowerCase());
    return acc + (isMain ? WEIGHTS.MAIN_WORD_MULTIPLIER : 1.0);
  }, 0);

  const score = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;

  // UIのバッジ・色（feedbackConfig.ts）と同じ5段階しきい値でティアを判定する。
  // コメント生成側とUI表示側で別基準を持たないようにするため、getScoreTierに一本化。
  const tier = getScoreTier(score);
  const groups = collectIssueGroups(matches, mainWords);
  const summary = buildSummary(tier, groups);
  const issues = buildIssues(groups);

  return {
    matches,
    score,
    summary,
    issues,
    // hasIssuesはUI側で使う可能性があるため付与
    hasIssues: matches.some(m => m.isFuzzy || m.isCombined || !m.isMatch),
  };
}

/**
 * 「正解語」と「実際に認識された語(heard)」のペア。FUZZY/COMBINEDの根拠提示に使う。
 * confusionは既知の音素混同パターン（L/R等）に一致した場合のみ設定され、
 * summary/issuesで「何の音の混同か」を当て推量なしで名指しする根拠として使う。
 */
interface WordEvidence {
  word: string;
  heard: string;
  confusion?: PhoneticConfusionRule;
}

interface IssueGroups {
  missingMainWords: string[];
  fuzzyMainWords: WordEvidence[];
  missingWords: string[];
  fuzzyWords: WordEvidence[];
  combinedWords: WordEvidence[];
}

/**
 * 一致結果(matches)を、コメント生成に使う単語グループへ分類する。
 * メイン単語（見出し語やフレーズの主要語）とそれ以外を分けて扱うことで、
 * 「何が」「どの単語が」原因でスコアが下がったのかを具体的に示せるようにする。
 * FUZZY/COMBINEDは実際に認識された語(heard)も保持し、
 * 「L/Rや母音」のような音素の当て推量をせず、事実（何が何に聞こえたか）だけで根拠を示せるようにする。
 */
function collectIssueGroups(matches: WordMatch[], mainWords: string[]): IssueGroups {
  const isMain = (word: string) => mainWords.some(mw => mw.toLowerCase() === word.toLowerCase());

  const groups: IssueGroups = {
    missingMainWords: [],
    fuzzyMainWords: [],
    missingWords: [],
    fuzzyWords: [],
    combinedWords: [],
  };

  matches.forEach(m => {
    if (isMain(m.word)) {
      if (!m.isMatch) groups.missingMainWords.push(m.word);
      else if (m.isFuzzy) groups.fuzzyMainWords.push({ word: m.word, heard: m.heard, confusion: detectPhoneticConfusion(m.word, m.heard) });
      return;
    }
    if (!m.isMatch) groups.missingWords.push(m.word);
    else if (m.isFuzzy) groups.fuzzyWords.push({ word: m.word, heard: m.heard, confusion: detectPhoneticConfusion(m.word, m.heard) });
    else if (m.isCombined) groups.combinedWords.push({ word: m.word, heard: m.heard });
  });

  return groups;
}

/** 単語リストを「「word1」「word2」など」の形式に整形する（表示が長くなりすぎないよう上限を設ける） */
function formatWords(words: string[], max = 2): string {
  const unique = Array.from(new Set(words));
  if (unique.length === 0) return '';
  const shown = unique.slice(0, max).map(w => `「${w}」`).join('、');
  return unique.length > max ? `${shown}など` : shown;
}

/** 「正解語→聞き取られた語」のペアを「「word」→「heard」」の形式に整形する */
function formatWordPairs(pairs: WordEvidence[], max = 2): string {
  const unique = Array.from(new Map(pairs.map(p => [`${p.word}:${p.heard}`, p])).values());
  if (unique.length === 0) return '';
  const shown = unique.slice(0, max).map(p => `「${p.word}」→「${p.heard}」`).join('、');
  return unique.length > max ? `${shown}など` : shown;
}

/**
 * 音素混同ルールが検出できた場合のみ、summary文に添える補足（例:「（「L」と「R」が近い音として認識されやすい発音です）」）を返す。
 * 未検出の場合は空文字を返し、従来通り事実（heard語）だけの表現に留める。
 */
function formatConfusionNote(confusion?: PhoneticConfusionRule): string {
  return confusion ? `（${confusion.label}が近い音として認識されやすい発音です）` : '';
}

/**
 * メインコメント(summary)の生成。「診断」の役割に専念する。
 *
 * excellent/great帯はスコアそのものが「ほぼ完璧」を表しているため、非メイン単語の
 * 些細な指摘だけでトーンを診断寄りに崩さない（例: 長文中の1単語だけFUZZYでもスコア91点、
 * のようなケースで「〜のように聞こえました」＋「自信を持って」が同居する矛盾を避ける）。
 * 指摘(issues)が実在する場合は、称賛コメントの中で「詳細はアドバイス欄へ」と一言だけ添える。
 *
 * good/fair/poor帯は指摘そのものがスコアの主要因なので、従来通り事実（何がどう聞き取られたか）を
 * 優先順位付きで1点だけ取り上げ、スコア帯に応じた短い一言でモチベーションを支える。
 */
function buildSummary(tier: ScoreTier, groups: IssueGroups): string {
  const { missingMainWords, fuzzyMainWords, missingWords, fuzzyWords, combinedWords } = groups;
  const hasAnyIssue =
    missingMainWords.length > 0 ||
    fuzzyMainWords.length > 0 ||
    missingWords.length > 0 ||
    fuzzyWords.length > 0 ||
    combinedWords.length > 0;

  if (tier === 'excellent' || tier === 'great') {
    const pool = hasAnyIssue ? PRAISE_WITH_MINOR_NOTE[tier] : PRAISE_COMMENTS[tier];
    return pickRandom(pool);
  }

  let diagnosis: string | null = null;
  if (missingMainWords.length > 0) {
    diagnosis = `重要な単語 ${formatWords(missingMainWords)} が聞き取れませんでした。`;
  } else if (fuzzyMainWords.length > 0) {
    diagnosis = `重要な単語の「${fuzzyMainWords[0].word}」が「${fuzzyMainWords[0].heard}」のように聞こえました${formatConfusionNote(fuzzyMainWords[0].confusion)}。`;
  } else if (missingWords.length > 0) {
    diagnosis = `${formatWords(missingWords)} が聞き取れませんでした。`;
  } else if (fuzzyWords.length > 0) {
    diagnosis = `「${fuzzyWords[0].word}」が「${fuzzyWords[0].heard}」のように聞こえました${formatConfusionNote(fuzzyWords[0].confusion)}。`;
  } else if (combinedWords.length > 0) {
    diagnosis = `${formatWords(combinedWords.map(c => c.word))} は単語同士がつながって聞こえました。`;
  }

  if (diagnosis) {
    return `${diagnosis} ${pickRandom(ENCOURAGEMENT_BY_TIER[tier])}`;
  }

  // good/fair/poor帯なのにissuesが全て空になるケース(理論上ほぼ無いが型の網羅性のための保険)
  return pickRandom(PRAISE_COMMENTS.great);
}

/**
 * 改善アドバイス欄(issues)の生成。summaryが「診断」なのに対し、こちらは「処方」の役割に専念する。
 * 根拠（正解語→聞き取り結果）は引き続き添えつつ、具体的な練習アクションを主役にする。
 * 音素混同が検出できた場合は、汎用的な練習文言の代わりにそのルール固有のtip（口の形など）を使い、
 * 「同じ事実でもsummaryとは異なる、より実践的な処方」として役割を差別化する。
 *
 * ポップアップ表示の可読性を優先し、重要度順（重要語→通常語の欠落→曖昧一致→結合）で
 * 最大2件までに絞って返す。
 */
function buildIssues(groups: IssueGroups): string[] {
  const { missingMainWords, fuzzyMainWords, missingWords, fuzzyWords, combinedWords } = groups;
  const issues: string[] = [];

  if (missingMainWords.length > 0) {
    issues.push(`最重要語の ${formatWords(missingMainWords)} は、口を大きく開けてゆっくり発音するところから練習してみましょう。`);
  } else if (fuzzyMainWords.length > 0) {
    const tip = fuzzyMainWords[0].confusion?.tip ?? '一音ずつ区切って強調すると、さらに伝わりやすくなります。';
    issues.push(`最重要語の ${formatWordPairs(fuzzyMainWords)} と認識されています。${tip}`);
  }
  if (missingWords.length > 0) {
    issues.push(`${formatWords(missingWords)} が認識されていません。息をしっかり出して、はっきり発音してみましょう。`);
  }
  if (fuzzyWords.length > 0) {
    const tip = fuzzyWords[0].confusion?.tip ?? '似た音の単語と聞き比べながら練習すると効果的です。';
    issues.push(`${formatWordPairs(fuzzyWords)} と認識されています。${tip}`);
  }
  if (combinedWords.length > 0) {
    issues.push(`${formatWordPairs(combinedWords)} とつながって聞こえています。区切りを意識すると、さらに自然な発音になります。`);
  }

  return issues.slice(0, 2);
}