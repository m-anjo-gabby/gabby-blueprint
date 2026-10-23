import assert from 'node:assert/strict';
import { test } from 'node:test';
import { timeStretch } from '@gabby/lib/audio/core/timeStretch';

/**
 * 再生速度の変更（単語帳・スプリントのドリル）。高さを変えずに長さだけを変える。
 * 高さが保たれることは、正弦波の周期（ゼロ交差の間隔）が変わらないことで確かめる。
 */

const SAMPLE_RATE = 44100;

function sine(frequency: number, seconds: number, amplitude = 0.5): Float32Array {
  const data = new Float32Array(Math.round(SAMPLE_RATE * seconds));
  for (let i = 0; i < data.length; i++) data[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);
  return data;
}

/** 上向きのゼロ交差の間隔から周波数を求める（両端の枠の影響を避けて中央だけを見る） */
function estimateFrequency(data: Float32Array): number {
  const from = Math.floor(data.length * 0.2);
  const to = Math.floor(data.length * 0.8);
  const crossings: number[] = [];
  for (let i = from + 1; i < to; i++) {
    if (data[i - 1] < 0 && data[i] >= 0) crossings.push(i);
  }
  const span = crossings[crossings.length - 1] - crossings[0];
  return ((crossings.length - 1) * SAMPLE_RATE) / span;
}

function rms(data: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / (to - from));
}

for (const rate of [0.8, 1.2, 1.5]) {
  test(`${rate}倍速: 長さが 1/${rate} になり、高さ（周波数）と音量は変わらない`, () => {
    const input = sine(220, 1);
    const [output] = timeStretch([input], rate, SAMPLE_RATE);

    assert.equal(output.length, Math.round(input.length / rate));
    assert.ok(Math.abs(estimateFrequency(output) - 220) < 2, `周波数 ${estimateFrequency(output)}`);
    const middle = rms(output, Math.floor(output.length * 0.2), Math.floor(output.length * 0.8));
    assert.ok(Math.abs(middle - 0.5 / Math.SQRT2) < 0.02, `音量 ${middle}`);
  });
}

test('チャンネルごとに同じ位置で伸び縮みさせ、左右の音がずれない', () => {
  const input = sine(330, 0.5);
  const [left, right] = timeStretch([input, input.slice()], 1.5, SAMPLE_RATE);
  assert.deepEqual(left, right);
});

test('等倍と、枠より短い音声はそのまま返す', () => {
  const input = sine(220, 0.5);
  assert.deepEqual(timeStretch([input], 1, SAMPLE_RATE)[0], input);
  const short = sine(220, 0.01);
  assert.deepEqual(timeStretch([short], 1.5, SAMPLE_RATE)[0], short);
});
