import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSsml } from '@gabby/lib/azure/ssml';
import {
  countVowelPhonemes,
  expectedColorVowel,
  ipaToPhonemes,
  parseIpa,
  stressedVowelPosition,
} from '@gabby/lib/colorVowel/phonemes';
import type { TTSAdjustmentData, WordAdjustment } from '@gabby/types/word';

/**
 * 教材の音声（Azure の SSML）の組み立てと、Color Vowel の辞書で使う IPA の分解。
 * 画面: docs/screens/admin/tools/（TTS の作成・CV 辞書）
 */

const settings = { voice: 'en-US-JennyNeural', style: 'friendly', rate: 0.9, pitch: -5 };
const word = (text: string, fullText: string, extra: Partial<WordAdjustment> = {}): WordAdjustment => ({
  id: text,
  text,
  fullText,
  emphasis: false,
  emphasisLevel: 'moderate',
  breakAfter: false,
  breakDuration: 0,
  ipa: '',
  ...extra,
});

const prosodyOf = (ssml: string) => ssml.match(/<prosody[^>]*>([\s\S]*)<\/prosody>/)?.[1];

test('SSML: 声・話し方・速さ・高さを入れ、語の調整が無ければ原文を使う', () => {
  const data: TTSAdjustmentData = { settings, words: [] };
  const ssml = buildSsml('Tom & "Jerry"', data);
  assert.match(ssml, /<voice name="en-US-JennyNeural">/);
  assert.match(ssml, /<mstts:express-as style="friendly">/);
  assert.match(ssml, /<prosody rate="0.9" pitch="-5%">/);
  // XML の特殊文字は逃がす
  assert.equal(prosodyOf(ssml), 'Tom &amp; &quot;Jerry&quot;');
  assert.match(buildSsml('Hi', { settings: { ...settings, pitch: 0 }, words: [] }), /pitch="\+0%"/);
});

test('SSML: 発音記号・強調・間を語ごとに付け、句読点は発音記号の外に残す', () => {
  const data: TTSAdjustmentData = {
    settings,
    words: [
      word('read', 'read,', { ipa: ' rɛd ' }),
      word('this', 'this', { emphasis: true, emphasisLevel: 'strong', breakAfter: true, breakDuration: 300 }),
      word('<now>', '<now>'),
    ],
  };
  assert.equal(
    prosodyOf(buildSsml('ignored', data)),
    '<phoneme alphabet="ipa" ph="rɛd">read</phoneme>, <emphasis level="strong">this</emphasis><break time="300ms"/> &lt;now&gt;',
  );
});

test('IPA: 音素に分け、強勢の記号の次の母音に強勢を付ける', () => {
  assert.deepEqual(parseIpa('ˈkæt'), {
    phonemes: [
      { code: 'k', stressed: false },
      { code: 'ae', stressed: true },
      { code: 't', stressed: false },
    ],
    unknownSymbols: [],
  });
  // 強勢の記号の後に子音があっても、次の母音に強勢を付ける
  const arrive = parseIpa('əˈraɪv').phonemes;
  assert.deepEqual(
    arrive.map((p) => `${p.code}${p.stressed ? '*' : ''}`),
    ['ax', 'r', 'ay*', 'v'],
  );
  // 語末の /ər/ は R 音化した母音 er
  assert.deepEqual(
    parseIpa('ˈtiːtʃər').phonemes.map((p) => p.code),
    ['t', 'iy', 'ch', 'er'],
  );
  // 強勢の記号が無ければ、最初の母音に強勢を付ける
  assert.equal(parseIpa('dɔg').phonemes.find((p) => p.stressed)?.code, 'ao');
});

test('IPA: 変換できない記号を含む・空なら表示しない', () => {
  assert.equal(ipaToPhonemes('ˈkæx'), null);
  assert.equal(ipaToPhonemes(''), null);
  assert.equal(ipaToPhonemes(null), null);
  assert.equal(ipaToPhonemes('/ˈkæt/')?.length, 3);
});

test('Color Vowel: 強勢のある母音から色を決め、直後の r で色が変わる母音を扱う', () => {
  const colorOf = (ipa: string) => expectedColorVowel(parseIpa(ipa).phonemes);
  assert.equal(colorOf('ˈkæt'), 'black_cat');
  assert.equal(colorOf('ˈtiːtʃər'), 'green_tea');
  assert.equal(colorOf('ˈbɜːrd'), 'purple_shirt');
  assert.equal(colorOf('ˈdɔːr'), 'orange_door');
  assert.equal(colorOf('ˈdɔg'), 'auburn_dog');
  assert.equal(expectedColorVowel([]), null);
});

test('母音の数と強勢の位置（音節の数との照合に使う）', () => {
  const teacher = parseIpa('ˈtiːtʃər').phonemes;
  assert.equal(countVowelPhonemes(teacher), 2);
  assert.equal(stressedVowelPosition(teacher), 1);
  assert.equal(stressedVowelPosition(parseIpa('əˈraɪv').phonemes), 2);
  assert.equal(stressedVowelPosition([{ code: 'k', stressed: false }]), null);
});
