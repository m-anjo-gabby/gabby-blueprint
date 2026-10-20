import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVideoObjectKey, checkVideoFile, isVideoObjectKeyOf, VIDEO_FILE_MAX_BYTES } from '@gabby/lib/video/files';
import { formatVideoDuration } from '@gabby/lib/video/format';
import { moveInOrder, nextSeqNo, renumberChanges } from '@gabby/lib/video/order';
import { isVideoCategory } from '@gabby/types/video';

/** ビデオのファイルの受け付けの判定・バケットの中のキーの組み立て・並べ替え・再生時間の表示 */

const VIDEO_ID = '3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f';
const FILE_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';

test('ファイルの判定: 種類ごとの MIME タイプと上限の大きさだけを受け付ける', () => {
  assert.deepEqual(checkVideoFile('video', { type: 'video/mp4', size: 1 }), { ok: true, extension: 'mp4' });
  assert.deepEqual(checkVideoFile('thumbnail', { type: 'image/jpeg', size: 1 }), { ok: true, extension: 'jpg' });
  assert.deepEqual(checkVideoFile('video', { type: 'image/png', size: 1 }), { ok: false, error: 'unsupported_type' });
  assert.deepEqual(checkVideoFile('thumbnail', { type: 'video/mp4', size: 1 }), {
    ok: false,
    error: 'unsupported_type',
  });
  assert.deepEqual(checkVideoFile('video', { type: 'video/mp4', size: 0 }), { ok: false, error: 'empty_file' });
  assert.equal(checkVideoFile('video', { type: 'video/mp4', size: VIDEO_FILE_MAX_BYTES.video }).ok, true);
  assert.deepEqual(checkVideoFile('video', { type: 'video/mp4', size: VIDEO_FILE_MAX_BYTES.video + 1 }), {
    ok: false,
    error: 'file_too_large',
  });
});

test('キー: {video_id}/{uuid}.<拡張子> で作り、毎回別のキーになる', () => {
  assert.equal(buildVideoObjectKey(VIDEO_ID, 'mp4', FILE_ID), `${VIDEO_ID}/${FILE_ID}.mp4`);
  assert.equal(buildVideoObjectKey(VIDEO_ID.toUpperCase(), 'png', FILE_ID), `${VIDEO_ID}/${FILE_ID}.png`);
  assert.notEqual(buildVideoObjectKey(VIDEO_ID, 'mp4'), buildVideoObjectKey(VIDEO_ID, 'mp4'));
  assert.throws(() => buildVideoObjectKey('../other', 'mp4'));
  assert.throws(() => buildVideoObjectKey(VIDEO_ID, 'mp4/../x'));
});

test('キーの持ち主: そのビデオのフォルダーの、組み立てた形のキーだけを認める', () => {
  const key = buildVideoObjectKey(VIDEO_ID, 'mp4');
  assert.equal(isVideoObjectKeyOf(VIDEO_ID, key), true);
  assert.equal(isVideoObjectKeyOf(FILE_ID, key), false);
  assert.equal(isVideoObjectKeyOf(VIDEO_ID, `${VIDEO_ID}/../${FILE_ID}.mp4`), false);
  assert.equal(isVideoObjectKeyOf(VIDEO_ID, `${VIDEO_ID}/not-a-uuid.mp4`), false);
  assert.equal(isVideoObjectKeyOf(VIDEO_ID, `${VIDEO_ID}/sub/${FILE_ID}.mp4`), false);
});

test('ビデオ教材の種類: 1〜3 の数値だけを認める', () => {
  assert.equal(isVideoCategory(1), true);
  assert.equal(isVideoCategory(3), true);
  assert.equal(isVideoCategory(4), false);
  assert.equal(isVideoCategory('1'), false);
  assert.equal(isVideoCategory(null), false);
});

test('並べ替え: 隣と入れ替え、端では動かさない', () => {
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  assert.equal(moveInOrder(['a', 'b', 'c'], 'a', -1), null);
  assert.equal(moveInOrder(['a', 'b', 'c'], 'c', 1), null);
  assert.equal(moveInOrder(['a', 'b'], 'x', 1), null);
});

test('並べ替え: 1 からの連番に振り直し、変わった行だけを返す（重複・欠番も詰める）', () => {
  const current = [
    { id: 'a', seq_no: 1 },
    { id: 'b', seq_no: 1 },
    { id: 'c', seq_no: 5 },
  ];
  assert.deepEqual(renumberChanges(['a', 'b', 'c'], current), [
    { id: 'b', seq_no: 2 },
    { id: 'c', seq_no: 3 },
  ]);
  assert.deepEqual(
    renumberChanges(
      ['a', 'b'],
      [
        { id: 'a', seq_no: 1 },
        { id: 'b', seq_no: 2 },
      ],
    ),
    [],
  );
  assert.equal(nextSeqNo([]), 1);
  assert.equal(nextSeqNo([{ seq_no: 3 }, { seq_no: 1 }]), 4);
});

test('再生時間: m:ss、1時間以上は h:mm:ss、未計測は -', () => {
  assert.equal(formatVideoDuration(0), '0:00');
  assert.equal(formatVideoDuration(65), '1:05');
  assert.equal(formatVideoDuration(3725), '1:02:05');
  assert.equal(formatVideoDuration(null), '-');
  assert.equal(formatVideoDuration(-1), '-');
});
