import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupVideoPairs, videoPairPositions } from '@gabby/lib/video/pairs';

/** ビデオのペア（並び順で次のビデオと組む。今日のメニューと admin の表示で同じ組み方を使う） */

const video = (video_id: string, pair_with_next = false) => ({ video_id, pair_with_next });
const ids = (groups: { video_id: string }[][]) => groups.map((g) => g.map((v) => v.video_id));

test('印のあるビデオを次の1本と組にし、印の無いビデオはシングルにする', () => {
  assert.deepEqual(ids(groupVideoPairs([video('a', true), video('b'), video('c'), video('d', true), video('e')])), [
    ['a', 'b'],
    ['c'],
    ['d', 'e'],
  ]);
  assert.deepEqual(ids(groupVideoPairs([])), []);
});

test('組の2本目の印・最後のビデオの印は使わない（1本が2つの組に入らない）', () => {
  assert.deepEqual(ids(groupVideoPairs([video('a', true), video('b', true), video('c'), video('d', true)])), [
    ['a', 'b'],
    ['c'],
    ['d'],
  ]);
});

test('admin の一覧に出す、ペアの中の位置', () => {
  const positions = videoPairPositions([video('a', true), video('b'), video('c', true)]);
  assert.deepEqual(
    [...positions],
    [
      ['a', 1],
      ['b', 2],
      ['c', null],
    ],
  );
});
