// packages/lib/assessment/feedbackMessages.ts
import { type ScoreTier } from './feedbackConfig';
import catalog from './feedbackMessages.json';

/**
 * 発話の評価で学習者に見せる文言（feedbackMessages.json）の型と差し込み。
 * 文言はロジックから分け、運営との確認（scripts/speech-feedback/）で JSON だけを書き換えられるようにしている。
 */

/** 指摘の種類。並びは一言（summary）で取り上げる優先順（重要語 → 冠詞 → その他の語、欠落 → 聞き違い）。 */
export const ISSUE_KINDS = [
  'missingMainWord',
  'fuzzyMainWord',
  'missingArticle',
  'fuzzyArticle',
  'missingWord',
  'fuzzyWord',
  'combinedWord',
] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

/** 診断＋励ましの一言を出す帯。Excellent・Great は指摘を書かずに褒める。 */
export type DiagnosisTier = Exclude<ScoreTier, 'excellent' | 'great'>;
export const DIAGNOSIS_TIERS: DiagnosisTier[] = ['good', 'fair', 'poor'];

export type MessagePlaceholder = 'words' | 'word' | 'heard' | 'pairs' | 'confusionNote' | 'tip' | 'label';
export type MessageValues = Partial<Record<MessagePlaceholder, string>>;

export interface FeedbackMessageCatalog {
  /** 一覧（運営の確認用）に出す、指摘の種類の名前・出る場面・表示例の差し込み値 */
  kinds: Record<IssueKind, { name: string; when: string; example: MessageValues }>;
  summary: {
    /** すべての単語が聞き取れた（Excellent で指摘なし） */
    perfect: string[];
    /** Excellent・Great だが指摘が残る。詳細は「改善のヒント」へ譲る */
    highWithNote: Record<Exclude<ScoreTier, DiagnosisTier>, string[]>;
    /** Good・Fair・Poor の一言の1文目。最も優先する指摘1つを事実として書く */
    diagnosis: Record<IssueKind, string>;
    /** 聞き違いが既知の音の組（L/R 等）に当たる場合に diagnosis の {confusionNote} へ入れる */
    confusionNote: string;
    /** diagnosis に続く2文目。指摘と帯の組で選び、指摘を打ち消す言い方（「この調子で」等）にしない */
    encouragement: Record<IssueKind, Record<DiagnosisTier, string[]>>;
  };
  /** 「改善のヒント」の各行（処方） */
  advice: Record<IssueKind, string>;
  /** 聞き違いが既知の音の組に当たらない場合の {tip} */
  defaultTip: Record<'fuzzyMainWord' | 'fuzzyWord', string>;
  /** 既知の音の組（phoneticConfusions.ts の id）ごとの表示名と練習のこつ */
  confusions: Record<string, { label: string; tip: string }>;
}

export const FEEDBACK_MESSAGES: FeedbackMessageCatalog = catalog;

/** {words} などの差し込み語を値に置き換える。値の無い差し込み語はそのまま残す（単体テストで残りを検査する）。 */
export function fillMessage(template: string, values: MessageValues = {}): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key as MessagePlaceholder] ?? placeholder);
}

/** 文言に含まれる差し込み語の一覧 */
export function placeholdersOf(template: string): string[] {
  return Array.from(template.matchAll(/\{(\w+)\}/g), (m) => m[1]);
}
