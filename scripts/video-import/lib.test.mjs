// 実行: node --test scripts/video-import/lib.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  clipEncodeArgs,
  FILE_MODE,
  flattenCatalog,
  needsReencode,
  planImport,
  sectionKey,
  validateCatalog,
} from './lib.mjs';

const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));

const sample = {
  contents: [
    {
      label: 'A',
      name: 'A',
      category: 1,
      sections: [
        { name: null, videos: [{ legacyCode: 'a1.mp4', title: 't', video: 'x/a1.mp4', thumbnail: 'x/a1.png' }] },
      ],
    },
    {
      label: 'B',
      name: 'B',
      category: 2,
      sections: [
        { name: 'Unit 1', videos: [{ legacyCode: 'b1.mp4', title: 't', video: 'x/b1.mp4', thumbnail: 'x/b1.png' }] },
        {
          name: 'Unit 2',
          videos: [
            { legacyCode: 'b2.mp4', title: 't', video: 'x/b2.mp4', thumbnail: 'x/b2.png' },
            { legacyCode: 'b3.mp4', title: 't', video: 'x/b3.mp4', thumbnail: 'x/b3.png' },
          ],
        },
      ],
    },
  ],
};

test('実物を置くのは本番だけ', () => {
  assert.deepEqual(FILE_MODE, { dev: 'clip', staging: 'clip', prod: 'full' });
});

test('再エンコードはビットレートが高い・720p を超える動画だけ', () => {
  assert.equal(needsReencode({ videoBitRate: 200_000, height: 720 }), false);
  assert.equal(needsReencode({ videoBitRate: 900_000, height: 720 }), false);
  assert.equal(needsReencode({ videoBitRate: 1_000_000, height: 720 }), true);
  assert.equal(needsReencode({ videoBitRate: 500_000, height: 1080 }), true);
  // ビットレートが読めない動画は、安全のため作り直す
  assert.equal(needsReencode({ videoBitRate: 0, height: 720 }), true);
});

test('切り出しは10秒の地点から。短い動画は先頭から', () => {
  const start = (args) => args[args.indexOf('-ss') + 1];
  assert.equal(start(clipEncodeArgs('in.mp4', 'out.mp4', 60)), '10');
  assert.equal(start(clipEncodeArgs('in.mp4', 'out.mp4', 13)), '10');
  assert.equal(start(clipEncodeArgs('in.mp4', 'out.mp4', 12.9)), '0');
  assert.equal(clipEncodeArgs('in.mp4', 'out.mp4', 60).at(-1), 'out.mp4');
});

test('catalog.json は正しい（旧マスタの194本）', () => {
  assert.deepEqual(validateCatalog(catalog), []);
  assert.equal(flattenCatalog(catalog).length, 194);
});

test('定義の誤りを見つける', () => {
  const bad = structuredClone(sample);
  bad.contents[1].label = 'A';
  bad.contents[1].category = 9;
  bad.contents[1].sections[1].videos[0].legacyCode = 'a1.mp4';
  bad.contents[1].sections[1].videos[1].title = '';
  bad.contents[0].sections.push({ name: 'empty', videos: [] });
  assert.deepEqual(validateCatalog(bad), [
    'ビデオの無い区切りがあります: A empty',
    '教材のラベルが重複しています: A',
    'ビデオの種類の値が不正です: A 9',
    '旧ファイル名が重複しています: a1.mp4',
    'タイトルがありません: b3.mp4',
  ]);
});

test('並び順は定義の順（1から）', () => {
  const flat = flattenCatalog(sample);
  assert.deepEqual(
    flat.map((f) => [f.video.legacyCode, f.contentSeq, f.sectionSeq, f.videoSeq]),
    [
      ['a1.mp4', 1, 1, 1],
      ['b1.mp4', 2, 1, 1],
      ['b2.mp4', 2, 2, 1],
      ['b3.mp4', 2, 2, 2],
    ],
  );
});

test('取り込み済みの教材・区切り・ビデオは作らない', () => {
  const plan = planImport(sample, {
    contentIdByLabel: new Map([['B', 'cB']]),
    sectionIdByKey: new Map([[sectionKey('cB', 'Unit 2'), 'sB2']]),
    legacyCodes: new Set(['b2.mp4']),
  });
  assert.equal(plan.newVideos, 3);
  assert.equal(plan.existingVideos, 1);
  assert.equal(plan.contents[0].contentId, null);
  assert.equal(plan.contents[1].contentId, 'cB');
  assert.deepEqual(
    plan.contents[1].sections.map((s) => [
      s.seq,
      s.sectionId,
      s.videos.map((v) => [v.video.legacyCode, v.seq, v.exists]),
    ]),
    [
      [1, null, [['b1.mp4', 1, false]]],
      [
        2,
        'sB2',
        [
          ['b2.mp4', 1, true],
          ['b3.mp4', 2, false],
        ],
      ],
    ],
  );
});

test('見出しの無い区切りは教材ごとに区別する', () => {
  assert.notEqual(sectionKey('c1', null), sectionKey('c2', null));
  assert.equal(sectionKey('c1', null), sectionKey('c1', null));
});
