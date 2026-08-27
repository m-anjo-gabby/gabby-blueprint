// packages/lib/assessment/phoneticConfusions.ts

/**
 * 日本語話者に頻出する音素混同パターン。
 * 新しいパターンを追加する場合はこの配列に1件足すだけでよく、検出ロジック側の変更は不要。
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

export const PHONETIC_CONFUSION_RULES: PhoneticConfusionRule[] = [
  {
    id: 'l-r',
    label: '「L」と「R」',
    tip: '舌先を上の歯の裏に軽く当てる「L」と、どこにも触れずに丸める「R」の違いを意識してみましょう。',
    pair: ['l', 'r'],
  },
  {
    id: 'b-v',
    label: '「B」と「V」',
    tip: '上下の唇を閉じて出す「B」と、上の歯を下唇に当てて出す「V」を区別してみましょう。',
    pair: ['b', 'v'],
  },
  {
    id: 'p-f',
    label: '「P」と「F」',
    tip: '唇を閉じて破裂させる「P」と、歯で息を摩擦させる「F」を区別してみましょう。',
    pair: ['p', 'f'],
  },
  {
    id: 's-th',
    label: '「S」と「TH」',
    tip: '舌を上下の歯で軽く挟んで息を出す「TH」の音を意識してみましょう。',
    pair: ['s', 'th'],
  },
  {
    id: 'd-th',
    label: '「D」と「TH（濁音）」',
    tip: '舌先を上下の歯の間に軽く挟んで出す、濁った「TH」の音を意識してみましょう。',
    pair: ['d', 'th'],
  },
  {
    id: 'z-s',
    label: '「Z」と「S」',
    tip: '喉を震わせる濁った「Z」と、震わせない「S」の違いを意識してみましょう。',
    pair: ['z', 's'],
  },
];

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

  return PHONETIC_CONFUSION_RULES.find(rule => {
    const [a, b] = rule.pair;
    return substitutedMatches(t, h, a, b) || substitutedMatches(t, h, b, a);
  });
}
