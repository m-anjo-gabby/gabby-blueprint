// packages/lib/assessment/native-speech.ts
import { AnalysisResult, WordMatch } from '@gabby/types/speechAssessment';
import { getScoreTier, ScoreTier } from './feedbackConfig';

// 重みの定義
const WEIGHTS = {
  EXACT: 1.0,
  COMBINED: 0.8,
  FUZZY: 0.6,
  MISSING: 0.0,
  MAIN_WORD_MULTIPLIER: 1.5,
};

// 課題が見つからなかった場合（全単語が完全一致）に表示する称賛コメント。
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
  const rawInputWords = input.toLowerCase().split(/\s+/).filter(w => w.length > 0);
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

interface IssueGroups {
  missingMainWords: string[];
  fuzzyMainWords: string[];
  missingWords: string[];
  fuzzyWords: string[];
  combinedWords: string[];
}

/**
 * 一致結果(matches)を、コメント生成に使う単語グループへ分類する。
 * メイン単語（見出し語やフレーズの主要語）とそれ以外を分けて扱うことで、
 * 「何が」「どの単語が」原因でスコアが下がったのかを具体的に示せるようにする。
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
      else if (m.isFuzzy) groups.fuzzyMainWords.push(m.word);
      return;
    }
    if (!m.isMatch) groups.missingWords.push(m.word);
    else if (m.isFuzzy) groups.fuzzyWords.push(m.word);
    else if (m.isCombined) groups.combinedWords.push(m.word);
  });

  return groups;
}

/** 単語リストを「"word1"、"word2"など」の形式に整形する（表示が長くなりすぎないよう上限を設ける） */
function formatWords(words: string[], max = 2): string {
  const unique = Array.from(new Set(words));
  if (unique.length === 0) return '';
  const shown = unique.slice(0, max).map(w => `「${w}」`).join('、');
  return unique.length > max ? `${shown}など` : shown;
}

/**
 * メインコメント(summary)の生成。
 * スコア帯からランダムに選ぶのではなく、実際にどの単語がどう判定されたか(matches)を
 * 優先順位付きで参照し、根拠のある一文を組み立てる。全単語が完全一致の場合のみ、
 * 判定結果に差の無い称賛コメントをバリエーションとしてランダム表示する。
 */
function buildSummary(tier: ScoreTier, groups: IssueGroups): string {
  const { missingMainWords, fuzzyMainWords, missingWords, fuzzyWords, combinedWords } = groups;

  if (missingMainWords.length > 0) {
    return `重要な単語 ${formatWords(missingMainWords)} が聞き取れませんでした。この単語を意識してもう一度挑戦してみましょう。`;
  }
  if (fuzzyMainWords.length > 0) {
    return `重要な単語 ${formatWords(fuzzyMainWords)} の発音がやや不明瞭でした。ここを意識するとぐっと良くなります。`;
  }
  if (missingWords.length > 0) {
    return `${formatWords(missingWords)} が聞き取れませんでした。一音ずつ、はっきりと発音してみましょう。`;
  }
  if (fuzzyWords.length > 0) {
    return `${formatWords(fuzzyWords)} の発音に少し惜しい部分がありました。口の形を意識してみましょう。`;
  }
  if (combinedWords.length > 0) {
    return `${formatWords(combinedWords)} は単語同士がつながって聞こえました。リンキングとしては自然ですが、一語ずつの区切りを意識するとさらに明瞭になります。`;
  }

  const pool = tier === 'excellent' ? PRAISE_COMMENTS.excellent : PRAISE_COMMENTS.great;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 改善アドバイス欄(issues)の生成。該当するカテゴリごとに、実際の単語名を含む具体的な一文を積み上げる。 */
function buildIssues(groups: IssueGroups): string[] {
  const { missingMainWords, fuzzyMainWords, missingWords, fuzzyWords, combinedWords } = groups;
  const issues: string[] = [];

  if (missingMainWords.length > 0) {
    issues.push(`最重要語の ${formatWords(missingMainWords)} を意識して、もう一度発音してみましょう。`);
  } else if (fuzzyMainWords.length > 0) {
    issues.push(`最重要語の ${formatWords(fuzzyMainWords)} は発音がやや不明瞭でした。強調して伝えると効果的です。`);
  }
  if (missingWords.length > 0) {
    issues.push(`${formatWords(missingWords)} が聞き取れていません。注意して発音しましょう。`);
  }
  if (fuzzyWords.length > 0) {
    issues.push(`${formatWords(fuzzyWords)} はL/Rや母音の音を少し調整すると、より正確になります。`);
  }
  if (combinedWords.length > 0) {
    issues.push(`${formatWords(combinedWords)} は単語同士をつなげて読めています。より自然な響きです。`);
  }

  return issues;
}