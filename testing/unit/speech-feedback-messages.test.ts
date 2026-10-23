import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIAGNOSIS_TIERS,
  FEEDBACK_MESSAGES,
  fillMessage,
  ISSUE_KINDS,
  placeholdersOf,
  type IssueKind,
} from '@gabby/lib/assessment/feedbackMessages';
import { analyzePhrase } from '@gabby/lib/assessment/native-speech';
import { PHONETIC_CONFUSION_RULES } from '@gabby/lib/assessment/phoneticConfusions';

/**
 * 発話の評価の文言（feedbackMessages.json）。運営の確認を取り込んだ後も、差し込み語・組み合わせが崩れていないことを確かめる。
 */

const { summary, advice, defaultTip, confusions, kinds } = FEEDBACK_MESSAGES;

function assertPlaceholders(text: string, allowed: string[], where: string) {
  for (const p of placeholdersOf(text)) assert.ok(allowed.includes(p), `${where}: 使えない差し込み語 {${p}}`);
}

const FUZZY_KINDS: IssueKind[] = ['fuzzyMainWord', 'fuzzyArticle', 'fuzzyWord'];

test('文言: 指摘の種類 × 帯のすべての組に、空でない文がある', () => {
  for (const kind of ISSUE_KINDS) {
    assert.ok(summary.diagnosis[kind], `diagnosis.${kind}`);
    assert.ok(advice[kind], `advice.${kind}`);
    assert.ok(kinds[kind].name && kinds[kind].when, `kinds.${kind}`);
    for (const tier of DIAGNOSIS_TIERS) {
      const pool = summary.encouragement[kind][tier];
      assert.ok(pool.length > 0 && pool.every((t) => t.trim() !== ''), `encouragement.${kind}.${tier}`);
    }
  }
  for (const pool of [summary.perfect, summary.highWithNote.excellent, summary.highWithNote.great]) {
    assert.ok(pool.length > 0 && pool.every((t) => t.trim() !== ''));
  }
});

test('文言: 差し込み語は場所ごとに決めたものだけを使う', () => {
  for (const kind of ISSUE_KINDS) {
    const diagnosisAllowed = FUZZY_KINDS.includes(kind) ? ['word', 'heard', 'confusionNote'] : ['words'];
    assertPlaceholders(summary.diagnosis[kind], diagnosisAllowed, `diagnosis.${kind}`);
    const adviceAllowed = FUZZY_KINDS.includes(kind) || kind === 'combinedWord' ? ['pairs', 'tip'] : ['words'];
    assertPlaceholders(advice[kind], adviceAllowed, `advice.${kind}`);
    for (const tier of DIAGNOSIS_TIERS) {
      for (const text of summary.encouragement[kind][tier]) assertPlaceholders(text, [], `encouragement.${kind}`);
    }
  }
  assertPlaceholders(summary.confusionNote, ['label'], 'confusionNote');
  const plain = [
    ...summary.perfect,
    ...summary.highWithNote.excellent,
    ...summary.highWithNote.great,
    ...Object.values(defaultTip),
    ...Object.values(confusions).flatMap((c) => [c.label, c.tip]),
  ];
  for (const text of plain) assertPlaceholders(text, [], text);
  // {tip} は既知の音の組か defaultTip で必ず埋まる種類にだけ置く（冠詞の聞き違いには tip を渡していない）
  assert.ok(!placeholdersOf(advice.fuzzyArticle).includes('tip'));
});

test('文言: 一覧の表示例を差し込むと、差し込み語が残らない', () => {
  for (const kind of ISSUE_KINDS) {
    const { example } = kinds[kind];
    assert.deepEqual(placeholdersOf(fillMessage(summary.diagnosis[kind], example)), [], `diagnosis.${kind}`);
    assert.deepEqual(placeholdersOf(fillMessage(advice[kind], example)), [], `advice.${kind}`);
  }
});

test('文言: 聞き違えやすい音の組と、その表示名・こつの id がそろう', () => {
  assert.deepEqual(PHONETIC_CONFUSION_RULES.map((r) => r.id).sort(), Object.keys(confusions).sort());
  for (const rule of PHONETIC_CONFUSION_RULES) assert.ok(rule.label && rule.tip, rule.id);
});

test('文言: 指摘に続く励ましは、指摘を打ち消す言い方にしない', () => {
  // 「冠詞の「a」が聞き取れませんでした。この調子で続けていきましょう。」が「a を抜いたままでよい」と読めた不具合の再発防止
  for (const kind of ISSUE_KINDS) {
    for (const tier of DIAGNOSIS_TIERS) {
      for (const text of summary.encouragement[kind][tier]) {
        assert.ok(!/この調子|そのまま|今の感覚/.test(text), `encouragement.${kind}.${tier}: ${text}`);
      }
    }
  }
  // 弱く読む冠詞は言っても認識されないことがあるため、「抜けている」と言い切らず「聞き取れなかった」と書く
  const all = JSON.stringify(FEEDBACK_MESSAGES);
  assert.ok(!all.includes('抜けて'));
  // 画面の見出しは「改善のヒント」。別の名前で案内しない
  assert.ok(!all.includes('アドバイス欄'));
});

test('一言: Good以下は、最も優先する指摘とその種類に合った励ましを続ける', () => {
  // buy car / buy a car = 2 / 3.2 = 0.625（Good）。冠詞の欠落を取り上げる
  const result = analyzePhrase('buy car', 'buy a car');
  assert.ok(
    result.summary.startsWith(fillMessage(summary.diagnosis.missingArticle, { words: '「a」' })),
    result.summary,
  );
  assert.ok(
    summary.encouragement.missingArticle.good.some((t) => result.summary.endsWith(t)),
    result.summary,
  );
  assert.deepEqual(result.issues, [fillMessage(advice.missingArticle, { words: '「a」' })]);

  // 1語が2語に分かれただけなら 0.8 以上（Great）のため一言には出ず、「改善のヒント」に「分かれて聞こえた」と書く
  const combined = analyzePhrase('can not', 'cannot');
  assert.ok(summary.highWithNote.great.includes(combined.summary), combined.summary);
  assert.equal(combined.issues[0], fillMessage(advice.combinedWord, { pairs: '「cannot」→「can not」' }));
});

test('一言: Excellent・Great は指摘を書かずに褒め、指摘が残る場合は「改善のヒント」へ案内する', () => {
  assert.ok(summary.perfect.includes(analyzePhrase('I want to go home', 'I want to go home').summary));
  // 10語中1語の欠落 = 0.9（Excellent）
  const nearly = analyzePhrase(
    'one two three four five six seven eight nine',
    'one two three four five six seven eight nine ten',
  );
  assert.ok(summary.highWithNote.excellent.includes(nearly.summary), nearly.summary);
});
