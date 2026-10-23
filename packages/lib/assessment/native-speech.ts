// packages/lib/assessment/native-speech.ts
import { type AnalysisResult, type WordMatch } from '@gabby/types/speechAssessment';
import { getScoreTier, type ScoreTier } from './feedbackConfig';
import { FEEDBACK_MESSAGES, fillMessage, type IssueKind, type MessageValues } from './feedbackMessages';
import { preprocessInputWords } from './inputNormalization';
import { detectPhoneticConfusion, type PhoneticConfusionRule } from './phoneticConfusions';
import { isArticle } from './wordClassification';

// 重みの定義
const WEIGHTS = {
  EXACT: 1.0,
  COMBINED: 0.8,
  FUZZY: 0.6,
  MISSING: 0.0,
  MAIN_WORD_MULTIPLIER: 1.5,
  // 冠詞はネイティブが弱形で発音するため聞き取られにくい一方、文法上は意識されやすい語。
  // 内容語（MAIN_WORD_MULTIPLIER）ほどではないが、機能語（1.0倍）よりは重みを持たせる。
  ARTICLE_MULTIPLIER: 1.2,
};

// 一言（summary）の文言は候補から無作為に選ぶ。同じ判定結果での言い回しの違いだけなので、結果に差は出ない。
function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * 2つの文字列の類似度を計算 (Levenshtein距離ベース)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .trim();
  const s2 = str2
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0;

  const track = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + indicator);
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
  const t = target.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '');
  const i = input.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '');
  const threshold = t.length > 3 ? 0.7 : 0.85;
  return calculateSimilarity(t, i) >= threshold;
}

/**
 * スコア計算における単語1件あたりの重み。冠詞→内容語(mainWords)→機能語の順で判定する
 * （冠詞は呼び出し元がmainWordsに含めていても、専用の重みを優先する）。
 */
function wordWeight(word: string, mainWords: string[]): number {
  if (isArticle(word)) return WEIGHTS.ARTICLE_MULTIPLIER;
  const isMain = mainWords.some((mw) => mw.toLowerCase() === word.toLowerCase());
  return isMain ? WEIGHTS.MAIN_WORD_MULTIPLIER : 1.0;
}

/**
 * フレーズの解析を行い、詳細なマッチング結果を返す
 */
export function analyzePhrase(input: string, target: string, mainWords: string[] = []): AnalysisResult {
  // 口語短縮形の展開・フィラー除去・言い直しの統合を行ってからマッチングにかける
  const rawInputWords = preprocessInputWords(
    input
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0),
  );
  const targetWords = target.split(/\s+/).filter((w) => w.length > 0);

  // 【忖度用データ準備】隣接する単語を結合したリストを作成(元のインデックスを保持)
  const inputWordsWithCombined = [...rawInputWords];
  for (let i = 0; i < rawInputWords.length - 1; i++) {
    inputWordsWithCombined.push(rawInputWords[i] + ' ' + rawInputWords[i + 1]);
  }

  const matches: WordMatch[] = targetWords.map((tWord) => {
    const tLower = tWord.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '');

    // 1. 完全一致 (理想的な結果)
    if (rawInputWords.includes(tLower)) {
      return { word: tWord, isMatch: true, isFuzzy: false, isCombined: false, heard: tLower };
    }

    // 2. 単語結合による一致 (filter + rate = filtrate などを救済)
    const combinedMatch = inputWordsWithCombined.find(
      (iWord) => iWord.replace(/\s+/g, '') === tLower || checkFuzzy(tLower, iWord.replace(/\s+/g, '')),
    );
    if (combinedMatch && combinedMatch.includes(' ')) {
      return { word: tWord, isMatch: true, isFuzzy: false, isCombined: true, heard: combinedMatch };
    }

    // 3. 単体ワードでのファジー一致 (L/Rなどの発音ミス)
    const fuzzyMatch = rawInputWords.find((iWord) => checkFuzzy(tLower, iWord));
    if (fuzzyMatch) {
      return { word: tWord, isMatch: true, isFuzzy: true, isCombined: false, heard: fuzzyMatch };
    }

    // 4. 不一致 (heardを空文字にして型を合わせる)
    return { word: tWord, isMatch: false, isFuzzy: false, isCombined: false, heard: '' };
  });

  // スコア算出
  const totalScore = matches.reduce((acc, m) => {
    let wordScore = WEIGHTS.MISSING;
    if (m.isMatch) {
      if (m.isFuzzy) wordScore = WEIGHTS.FUZZY;
      else if (m.isCombined) wordScore = WEIGHTS.COMBINED;
      else wordScore = WEIGHTS.EXACT;
    }

    const weight = wordWeight(m.word, mainWords);

    return acc + wordScore * weight;
  }, 0);

  // 最大スコア
  const maxPossibleScore = targetWords.reduce((acc, word) => {
    return acc + wordWeight(word, mainWords);
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
    hasIssues: matches.some((m) => m.isFuzzy || m.isCombined || !m.isMatch),
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
  missingArticles: string[];
  fuzzyArticles: WordEvidence[];
  missingWords: string[];
  fuzzyWords: WordEvidence[];
  combinedWords: WordEvidence[];
}

/**
 * 一致結果(matches)を、コメント生成に使う単語グループへ分類する。
 * 重要度は「内容語(mainWords) → 冠詞 → その他の機能語」の順。
 * 冠詞はmainWordsに含まれていても専用グループとして扱い、他の機能語よりは優先しつつ
 * 内容語とは異なる（弱形発音を意識させる）コメントを出せるようにする。
 * FUZZY/COMBINEDは実際に認識された語(heard)も保持し、
 * 「L/Rや母音」のような音素の当て推量をせず、事実（何が何に聞こえたか）だけで根拠を示せるようにする。
 */
function collectIssueGroups(matches: WordMatch[], mainWords: string[]): IssueGroups {
  const isMain = (word: string) => mainWords.some((mw) => mw.toLowerCase() === word.toLowerCase());

  const groups: IssueGroups = {
    missingMainWords: [],
    fuzzyMainWords: [],
    missingArticles: [],
    fuzzyArticles: [],
    missingWords: [],
    fuzzyWords: [],
    combinedWords: [],
  };

  matches.forEach((m) => {
    if (isArticle(m.word)) {
      if (!m.isMatch) groups.missingArticles.push(m.word);
      else if (m.isFuzzy)
        groups.fuzzyArticles.push({
          word: m.word,
          heard: m.heard,
          confusion: detectPhoneticConfusion(m.word, m.heard),
        });
      return;
    }
    if (isMain(m.word)) {
      if (!m.isMatch) groups.missingMainWords.push(m.word);
      else if (m.isFuzzy)
        groups.fuzzyMainWords.push({
          word: m.word,
          heard: m.heard,
          confusion: detectPhoneticConfusion(m.word, m.heard),
        });
      return;
    }
    if (!m.isMatch) groups.missingWords.push(m.word);
    else if (m.isFuzzy)
      groups.fuzzyWords.push({ word: m.word, heard: m.heard, confusion: detectPhoneticConfusion(m.word, m.heard) });
    else if (m.isCombined) groups.combinedWords.push({ word: m.word, heard: m.heard });
  });

  return groups;
}

/** 単語リストを「「word1」「word2」など」の形式に整形する（表示が長くなりすぎないよう上限を設ける） */
function formatWords(words: string[], max = 2): string {
  const unique = Array.from(new Set(words));
  if (unique.length === 0) return '';
  const shown = unique
    .slice(0, max)
    .map((w) => `「${w}」`)
    .join('、');
  return unique.length > max ? `${shown}など` : shown;
}

/** 「正解語→聞き取られた語」のペアを「「word」→「heard」」の形式に整形する */
function formatWordPairs(pairs: WordEvidence[], max = 2): string {
  const unique = Array.from(new Map(pairs.map((p) => [`${p.word}:${p.heard}`, p])).values());
  if (unique.length === 0) return '';
  const shown = unique
    .slice(0, max)
    .map((p) => `「${p.word}」→「${p.heard}」`)
    .join('、');
  return unique.length > max ? `${shown}など` : shown;
}

/**
 * 音素混同ルールが検出できた場合のみ、summary文に添える補足（例:「（「L」と「R」が近い音として認識されやすい発音です）」）を返す。
 * 未検出の場合は空文字を返し、事実（heard語）だけの表現に留める。
 */
function formatConfusionNote(confusion?: PhoneticConfusionRule): string {
  return confusion ? fillMessage(FEEDBACK_MESSAGES.summary.confusionNote, { label: confusion.label }) : '';
}

function fuzzyDiagnosisValues(evidence: WordEvidence): MessageValues {
  return { word: evidence.word, heard: evidence.heard, confusionNote: formatConfusionNote(evidence.confusion) };
}

/**
 * 一言（summary）で取り上げる指摘を、優先順（重要語 → 冠詞 → その他の語、欠落 → 聞き違い → 2語に分かれた）で1つ選ぶ。
 * 指摘が無ければnullを返す。
 */
function findTopIssue(groups: IssueGroups): { kind: IssueKind; values: MessageValues } | null {
  const { missingMainWords, fuzzyMainWords, missingArticles, fuzzyArticles, missingWords, fuzzyWords, combinedWords } =
    groups;
  if (missingMainWords.length > 0) return { kind: 'missingMainWord', values: { words: formatWords(missingMainWords) } };
  if (fuzzyMainWords.length > 0) return { kind: 'fuzzyMainWord', values: fuzzyDiagnosisValues(fuzzyMainWords[0]) };
  if (missingArticles.length > 0) return { kind: 'missingArticle', values: { words: formatWords(missingArticles) } };
  if (fuzzyArticles.length > 0) return { kind: 'fuzzyArticle', values: fuzzyDiagnosisValues(fuzzyArticles[0]) };
  if (missingWords.length > 0) return { kind: 'missingWord', values: { words: formatWords(missingWords) } };
  if (fuzzyWords.length > 0) return { kind: 'fuzzyWord', values: fuzzyDiagnosisValues(fuzzyWords[0]) };
  if (combinedWords.length > 0) {
    return { kind: 'combinedWord', values: { words: formatWords(combinedWords.map((c) => c.word)) } };
  }
  return null;
}

/**
 * メインコメント(summary)の生成。「診断」の役割に専念する。
 *
 * excellent/great帯はスコアそのものが「ほぼ完璧」を表しているため、非メイン単語の
 * 些細な指摘だけでトーンを診断寄りに崩さない（例: 長文中の1単語だけFUZZYでもスコア91点、
 * のようなケースで「〜のように聞こえました」＋「自信を持って」が同居する矛盾を避ける）。
 * 指摘(issues)が実在する場合は、称賛コメントの中で「詳細は改善のヒントへ」と一言だけ添える。
 *
 * good/fair/poor帯は指摘そのものがスコアの主要因なので、事実（何がどう聞き取られたか）を
 * 優先順位付きで1点だけ取り上げ、その指摘と帯の組に合った一言を続ける。帯だけで選ぶと
 * 「冠詞の「a」が聞き取れませんでした。この調子で続けていきましょう。」のように、指摘を打ち消して読めてしまう。
 */
function buildSummary(tier: ScoreTier, groups: IssueGroups): string {
  const { summary } = FEEDBACK_MESSAGES;
  const top = findTopIssue(groups);

  if (tier === 'excellent' || tier === 'great') {
    return pickRandom(top ? summary.highWithNote[tier] : summary.perfect);
  }
  // good/fair/poor帯なのに指摘が無いケース(理論上ほぼ無いが型の網羅性のための保険)
  if (!top) return pickRandom(summary.perfect);

  return `${fillMessage(summary.diagnosis[top.kind], top.values)} ${pickRandom(summary.encouragement[top.kind][tier])}`;
}

/**
 * 改善アドバイス欄(issues)の生成。summaryが「診断」なのに対し、こちらは「処方」の役割に専念する。
 * 根拠（正解語→聞き取り結果）は引き続き添えつつ、具体的な練習アクションを主役にする。
 * 音素混同が検出できた場合は、汎用的な練習文言の代わりにそのルール固有のtip（口の形など）を使い、
 * 「同じ事実でもsummaryとは異なる、より実践的な処方」として役割を差別化する。
 *
 * ポップアップ表示の可読性を優先し、重要度順（重要語→冠詞→通常語の欠落→曖昧一致→結合）で
 * 最大2件までに絞って返す。
 */
function buildIssues(groups: IssueGroups): string[] {
  const { missingMainWords, fuzzyMainWords, missingArticles, fuzzyArticles, missingWords, fuzzyWords, combinedWords } =
    groups;
  const { advice, defaultTip } = FEEDBACK_MESSAGES;
  const issues: string[] = [];

  if (missingMainWords.length > 0) {
    issues.push(fillMessage(advice.missingMainWord, { words: formatWords(missingMainWords) }));
  } else if (fuzzyMainWords.length > 0) {
    const tip = fuzzyMainWords[0].confusion?.tip ?? defaultTip.fuzzyMainWord;
    issues.push(fillMessage(advice.fuzzyMainWord, { pairs: formatWordPairs(fuzzyMainWords), tip }));
  }
  if (missingArticles.length > 0) {
    issues.push(fillMessage(advice.missingArticle, { words: formatWords(missingArticles) }));
  } else if (fuzzyArticles.length > 0) {
    issues.push(fillMessage(advice.fuzzyArticle, { pairs: formatWordPairs(fuzzyArticles) }));
  }
  if (missingWords.length > 0) {
    issues.push(fillMessage(advice.missingWord, { words: formatWords(missingWords) }));
  }
  if (fuzzyWords.length > 0) {
    const tip = fuzzyWords[0].confusion?.tip ?? defaultTip.fuzzyWord;
    issues.push(fillMessage(advice.fuzzyWord, { pairs: formatWordPairs(fuzzyWords), tip }));
  }
  if (combinedWords.length > 0) {
    // combinedWordsは常に「本来1語のターゲットが、認識結果では音の近い2語に割れて聞こえた」
    // ケース（例: filtrate → filter rate、six-membered → six member）。ターゲットは元々1語なので
    // 「区切って発音する」方向のアドバイスは矛盾する。単語内の音をなめらかに一続きに
    // つなげる（リンキング）方向で助言する（文言は feedbackMessages.json）。
    issues.push(fillMessage(advice.combinedWord, { pairs: formatWordPairs(combinedWords) }));
  }

  return issues.slice(0, 2);
}
