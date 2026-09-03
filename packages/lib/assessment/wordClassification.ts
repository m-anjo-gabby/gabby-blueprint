// packages/lib/assessment/wordClassification.ts

/**
 * 冠詞。ネイティブは前後の単語とつなげて弱形（schwa等）で発音するため聞き取られにくい一方、
 * 文法的な正しさとしては意識されやすい語。他の機能語とは別カテゴリとして扱う。
 */
export const ARTICLES: ReadonlySet<string> = new Set(['a', 'an', 'the']);

// 意味的な重みが低く「重要語」から除外してよい機能語。カテゴリごとに配列で管理し、
// 追加・削除はこの一覧を編集するだけで済むようにする（検出ロジック側の変更は不要）。
const BE_VERBS = ['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being'];
const AUXILIARY_VERBS = ['do', 'does', 'did', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must'];
const PREPOSITIONS = ['in', 'on', 'at', 'to', 'of', 'for', 'with', 'about', 'as', 'by', 'from', 'into', 'onto', 'over', 'under', 'between', 'among', 'through', 'during', 'before', 'after', 'above', 'below', 'near', 'off', 'out', 'up', 'down'];
const PRONOUNS = ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'who', 'whom', 'whose', 'which', 'what'];
const CONJUNCTIONS = ['and', 'but', 'or', 'so', 'because', 'if', 'than', 'though', 'although', 'while', 'when', 'where'];

/**
 * 否定語（not/no/never等）は文の意味を反転させる重要語のため、
 * 機能語リストには意図的に含めない。
 */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  ...BE_VERBS,
  ...AUXILIARY_VERBS,
  ...PREPOSITIONS,
  ...PRONOUNS,
  ...CONJUNCTIONS,
]);

const normalize = (word: string): string =>
  word.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?']/g, "");

export const isArticle = (word: string): boolean => ARTICLES.has(normalize(word));

export const isFunctionWord = (word: string): boolean => FUNCTION_WORDS.has(normalize(word));

/**
 * 文中から内容語（名詞・動詞・形容詞・副詞など、意味の中心を担う語）だけを抽出する。
 * 冠詞・機能語をヒューリスティックに除外した残りを「重要語」の候補として扱うための関数。
 * 品詞解析器は導入せず、リスト方式に留めることで依存を増やさずメンテナンスできるようにしている。
 */
export const extractContentWords = (text: string): string[] =>
  text
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .filter(word => !isArticle(word) && !isFunctionWord(word));

/**
 * 文中の全単語をクリック位置順に保持したまま分割する（冠詞・機能語も含む）。
 * Lesson Sprintの「解答文を単語単位でクリックしてハイライトする」UI向け。
 * extractContentWordsは重要語抽出用に冠詞・機能語を除外するため、
 * どの単語でも印を付けられる用途にはこちらを使う。
 */
export const tokenizeWords = (text: string): string[] =>
  text
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "")
    .split(/\s+/)
    .filter(Boolean);

/**
 * tokenizeWordsと同じ空白区切り位置で単語を分割するが、句読点は保持する。
 * highlighted_word_indices はtokenizeWords基準のインデックスなので、
 * 表示専用にこちらを使う場合もインデックスの整合性は保たれる
 * （句読点の除去は単語境界を変えないため）。
 */
export const tokenizeWordsWithPunctuation = (text: string): string[] =>
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
