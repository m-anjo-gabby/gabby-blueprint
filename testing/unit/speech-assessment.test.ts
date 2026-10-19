import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getScoreTier } from '@gabby/lib/assessment/feedbackConfig';
import { preprocessInputWords } from '@gabby/lib/assessment/inputNormalization';
import { analyzePhrase, calculateSimilarity } from '@gabby/lib/assessment/native-speech';
import { detectPhoneticConfusion, PHONETIC_CONFUSION_RULES } from '@gabby/lib/assessment/phoneticConfusions';
import {
  extractContentWords,
  isArticle,
  isFunctionWord,
  tokenizeWords,
  tokenizeWordsWithPunctuation,
} from '@gabby/lib/assessment/wordClassification';

/**
 * 発話の評価（自主トレの単語帳・フレーズ・スプリント）。ブラウザの音声認識の結果を正解の文と比べて点数を付ける。
 * 総合のコメントは候補から無作為に選ぶため、ここでは一語ずつの判定・点数・改善点を確かめる。
 */

const tipOf = (id: string) => PHONETIC_CONFUSION_RULES.find((r) => r.id === id)?.tip ?? '';

test('認識結果の前処理: 句読点・言い淀み・言い直しを除き、口語の短縮形を展開する', () => {
  assert.deepEqual(preprocessInputWords(['i', 'wanna', 'go.']), ['i', 'want', 'to', 'go']);
  assert.deepEqual(preprocessInputWords(['um', 'i', 'i', 'uh', 'think']), ['i', 'think']);
  // 短縮形のアポストロフィは残す
  assert.deepEqual(preprocessInputWords(['dunno', "can't", '!']), ["don't", 'know', "can't"]);
});

test('語の分類: 冠詞・機能語を除いた内容語を取り出す（否定語は意味を変えるため残す）', () => {
  assert.equal(isArticle('The'), true);
  assert.equal(isFunctionWord('is'), true);
  assert.equal(isFunctionWord('not'), false);
  assert.deepEqual(extractContentWords('I will not buy a new car.'), ['not', 'buy', 'new', 'car']);
});

test('語の分割: 句読点を除いた分割と、表示用の句読点付きの分割で位置がそろう', () => {
  const text = 'Hello, world! How are you?';
  assert.deepEqual(tokenizeWords(text), ['Hello', 'world', 'How', 'are', 'you']);
  assert.deepEqual(tokenizeWordsWithPunctuation(text), ['Hello,', 'world!', 'How', 'are', 'you?']);
});

test('聞き違えやすい音: 1か所を入れ替えると一致する場合だけ、その組を返す', () => {
  assert.equal(detectPhoneticConfusion('light', 'right')?.id, 'l-r');
  assert.equal(detectPhoneticConfusion('very', 'berry')?.id, undefined); // 2文字違うため該当しない
  assert.equal(detectPhoneticConfusion('vest', 'best')?.id, 'b-v');
  assert.equal(detectPhoneticConfusion('think', 'sink')?.id, 's-th');
  assert.equal(detectPhoneticConfusion('Light.', 'right')?.id, 'l-r');
  assert.equal(detectPhoneticConfusion('light', 'light'), undefined);
  assert.equal(detectPhoneticConfusion('light', 'table'), undefined);
  assert.equal(detectPhoneticConfusion('', 'right'), undefined);
});

test('文字の近さ: 同じなら1、空なら0、1文字違いは文字数に応じた割合', () => {
  assert.equal(calculateSimilarity('Hello.', 'hello'), 1);
  assert.equal(calculateSimilarity('', 'hello'), 0);
  assert.equal(calculateSimilarity('light', 'right'), 0.8);
});

test('点数: 正解の文どおりに言えれば満点で、改善点は無い', () => {
  const result = analyzePhrase('I want to go.', 'I want to go.');
  assert.equal(result.score, 1);
  assert.equal(result.hasIssues, false);
  assert.deepEqual(result.issues, []);
  // 口語の短縮形で認識されても満点
  assert.equal(analyzePhrase('i wanna go', 'I want to go').score, 1);
});

test('点数: 言えなかった語は0点、重要語は1.5倍・冠詞は1.2倍の重みで数える', () => {
  assert.equal(analyzePhrase('i want to go', 'I want to go home').score, 4 / 5);
  assert.equal(analyzePhrase('i want to go', 'I want to go home', ['home']).score, 4 / 5.5);
  assert.equal(analyzePhrase('buy car', 'buy a car').score, 2 / 3.2);
  const missing = analyzePhrase('i want to go', 'I want to go home').matches.at(-1);
  assert.deepEqual(missing, { word: 'home', isMatch: false, isFuzzy: false, isCombined: false, heard: '' });
});

test('点数: 発音の近い語は 0.6、2語に分かれて認識された語は 0.8 として救う', () => {
  const fuzzy = analyzePhrase('right', 'light');
  assert.equal(fuzzy.score, 0.6);
  assert.deepEqual(fuzzy.matches[0], {
    word: 'light',
    isMatch: true,
    isFuzzy: true,
    isCombined: false,
    heard: 'right',
  });
  // 聞き違えやすい音（L と R）のアドバイスを改善点に出す
  assert.ok(
    fuzzy.issues.some((issue) => issue.includes(tipOf('l-r'))),
    fuzzy.issues.join('\n'),
  );

  const combined = analyzePhrase('i can not', 'I cannot');
  assert.equal(combined.matches[1].isCombined, true);
  assert.equal(combined.matches[1].heard, 'can not');
  assert.equal(combined.score, (1 + 0.8) / 2);
});

test('点数: 何も認識されなければ0点で、点数の段階は「poor」', () => {
  const result = analyzePhrase('', 'I want to go');
  assert.equal(result.score, 0);
  assert.ok(result.matches.every((m) => !m.isMatch));
  assert.equal(getScoreTier(result.score), 'poor');
  assert.equal(getScoreTier(0.9), 'excellent');
  assert.equal(getScoreTier(0.8), 'great');
});
