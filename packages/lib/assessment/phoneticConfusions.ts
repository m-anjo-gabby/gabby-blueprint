// packages/lib/assessment/phoneticConfusions.ts

import { FEEDBACK_MESSAGES } from './feedbackMessages';

/**
 * 日本語話者に頻出する音素混同パターン。
 * 新しいパターンを追加する場合は、ここに音の組を1件、feedbackMessages.json の confusions に同じ id で表示名とこつを足す
 * （検出ロジック側の変更は不要。両者の id がそろっていることは単体テストで検査する）。
 */
export interface PhoneticConfusionRule {
  id: string;
  /** コメント内にそのまま埋め込める表示用ラベル（例: 「L」と「R」） */
  label: string;
  /** issues（処方）欄で使う具体的な練習アドバイス */
  tip: string;
  /** 混同されやすい音の組（小文字・記号除去後の文字列同士で比較する） */
  pair: [string, string];
}

const CONFUSION_PAIRS: Pick<PhoneticConfusionRule, 'id' | 'pair'>[] = [
  { id: 'l-r', pair: ['l', 'r'] },
  { id: 'b-v', pair: ['b', 'v'] },
  { id: 'p-f', pair: ['p', 'f'] },
  { id: 's-th', pair: ['s', 'th'] },
  { id: 'd-th', pair: ['d', 'th'] },
  { id: 'z-s', pair: ['z', 's'] },
];

export const PHONETIC_CONFUSION_RULES: PhoneticConfusionRule[] = CONFUSION_PAIRS.map((rule) => ({
  ...rule,
  ...FEEDBACK_MESSAGES.confusions[rule.id],
}));

function normalize(word: string): string {
  return word.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '');
}

/** target内に出現する from を to に置き換えた結果が heard と一致する箇所があるかを判定する */
function substitutedMatches(target: string, heard: string, from: string, to: string): boolean {
  let searchFrom = 0;
  for (;;) {
    const index = target.indexOf(from, searchFrom);
    if (index === -1) return false;
    const substituted = target.slice(0, index) + to + target.slice(index + from.length);
    if (substituted === heard) return true;
    searchFrom = index + 1;
  }
}

/**
 * target と heard が「既知の混同ペアを1箇所だけ入れ替えると一致する」場合に該当ルールを返す。
 * 音素の当て推量ではなく、実際に置換して文字列が一致することを確認できた場合のみ返すため、
 * コメントで音の種類を名指しする根拠として扱ってよい。
 * 一致するルールが無い場合はundefinedを返し、呼び出し側は従来通り事実（heard語）だけで表現する。
 */
export function detectPhoneticConfusion(target: string, heard: string): PhoneticConfusionRule | undefined {
  const t = normalize(target);
  const h = normalize(heard);
  if (!t || !h || t === h) return undefined;

  return PHONETIC_CONFUSION_RULES.find((rule) => {
    const [a, b] = rule.pair;
    return substitutedMatches(t, h, a, b) || substitutedMatches(t, h, b, a);
  });
}
