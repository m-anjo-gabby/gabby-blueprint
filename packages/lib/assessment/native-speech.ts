// packages/lib/assessment/native-speech.ts
import { AnalysisResult, WordMatch } from '@gabby/types/speechAssessment';

// 重みの定義
const WEIGHTS = {
  EXACT: 1.0,
  COMBINED: 0.8,
  FUZZY: 0.6,
  MISSING: 0.0,
  MAIN_WORD_MULTIPLIER: 1.5,
};

// 総合スコアによるフィードバックコメント
const FEEDBACK_MATRIX = {
  HIGH: [
    "非常に明瞭で正確な発音です。この高い基準を維持しましょう。",
    "完璧なリズムと流暢さです。自信を持って活用してください。",
    "素晴らしいパフォーマンスです。今の感覚をぜひ定着させましょう。"
  ],
  MID: [
    "的確に伝わっています。細部の音の響きを意識すると、さらに磨きがかかります。",
    "惜しい精度です。単語のつながりを滑らかにすることで、より自然な響きになります。",
    "リズムは良好です。口の動きを意識し、より鮮明な発音を目指しましょう。"
  ],
  LOW: [
    "難易度の高いフレーズです。反復練習により、必ず慣れてくるはずです。",
    "一音一音の明瞭さを大切に、ゆっくりと正確な発音を心がけてみましょう。",
    "全体のリズムを再確認し、焦らずに落ち着いてもう一度挑戦してください。"
  ]
};

// 特定の改善ポイントを強調するための「トッピング」コメント
const ISSUE_SPECIFIC_COMMENTS: Record<string, string> = {
  MAIN: "メインの単語を強調して伝えると完璧です。",
  MISSING: "聞き取りづらい単語があるようなので、注意しましょう。",
  FUZZY: "L/Rや時制の発音を少し微調整すると、ぐっと良くなります。",
  COMBINED: "単語同士をさらにつなげて読むと、より自然な響きになります。"
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
  
  const hasMainWordMatch = mainWords.every(mw => 
    matches.some(m => m.word.toLowerCase() === mw.toLowerCase() && m.isMatch && !m.isFuzzy)
  );

  const { summary, issues } = getFeedback(matches, score, hasMainWordMatch);
  
  return { 
    matches, 
    score, 
    summary, 
    issues,
    // hasIssuesはUI側で使う可能性があるため付与
    hasIssues: matches.some(m => m.isFuzzy || m.isCombined || !m.isMatch) 
  };
}

// 優先順位に基づいたフィードバック生成ロジック
function getFeedback(matches: WordMatch[], score: number, hasMainWordMatch: boolean) {
  const range = score >= 0.9 ? 'HIGH' : score >= 0.6 ? 'MID' : 'LOW';
  const baseComments = FEEDBACK_MATRIX[range];
  const summary = baseComments[Math.floor(Math.random() * baseComments.length)];

  const issues: string[] = [];
  if (!hasMainWordMatch) issues.push(ISSUE_SPECIFIC_COMMENTS.MAIN);
  if (matches.some(m => !m.isMatch)) issues.push(ISSUE_SPECIFIC_COMMENTS.MISSING);
  if (matches.some(m => m.isFuzzy)) issues.push(ISSUE_SPECIFIC_COMMENTS.FUZZY);
  if (matches.some(m => m.isCombined)) issues.push(ISSUE_SPECIFIC_COMMENTS.COMBINED);

  return { summary, issues };
}