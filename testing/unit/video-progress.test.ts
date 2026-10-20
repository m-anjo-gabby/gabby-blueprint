import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countCompletedVideos,
  isWatchCompleted,
  pickInitialVideoId,
  resumePositionSec,
  videoProgressPercent,
} from '@gabby/lib/video/progress';
import type { StudentVideoItem, StudentVideoProgress, StudentVideoSection } from '@gabby/types/video';

/** 生徒のビデオの視聴の進み具合（最後まで見たか・続きの再生位置・最初に開くビデオ・一覧の進み具合） */

const DONE = '2026-10-20T00:00:00Z';
const progress = (last_position_sec: number, completed_at: string | null = null): StudentVideoProgress => ({
  last_position_sec,
  completed_at,
});
const video = (video_id: string, p: StudentVideoProgress | null = null): StudentVideoItem => ({
  video_id,
  title: video_id,
  description: null,
  duration_sec: 600,
  video_url: null,
  thumbnail_url: null,
  progress: p,
});
const sections = (...groups: StudentVideoItem[][]): StudentVideoSection[] =>
  groups.map((videos, i) => ({ section_id: `s${i}`, section_name: null, videos }));

test('最後まで見た: 残り3秒（短いビデオは長さの5%）以内、再生時間が分からない間は見終えない', () => {
  assert.equal(isWatchCompleted(597, 600), true);
  assert.equal(isWatchCompleted(596, 600), false);
  assert.equal(isWatchCompleted(19, 20), true);
  assert.equal(isWatchCompleted(18, 20), false);
  assert.equal(isWatchCompleted(100, null), false);
  assert.equal(isWatchCompleted(100, 0), false);
});

test('続きの再生位置: 途中のビデオはその位置、見ていない・見終えた・始まってすぐ・終わり間際は最初から', () => {
  assert.equal(resumePositionSec(progress(120), 600), 120);
  assert.equal(resumePositionSec(null, 600), 0);
  assert.equal(resumePositionSec(progress(120, DONE), 600), 0);
  assert.equal(resumePositionSec(progress(4), 600), 0);
  assert.equal(resumePositionSec(progress(598), 600), 0);
  assert.equal(resumePositionSec(progress(120), null), 120);
});

test('一覧の進み具合: 見終えたら100、途中は99まで、再生時間が分からなければ0', () => {
  assert.equal(videoProgressPercent(null, 600), 0);
  assert.equal(videoProgressPercent(progress(300), 600), 50);
  assert.equal(videoProgressPercent(progress(600), 600), 99);
  assert.equal(videoProgressPercent(progress(10, DONE), 600), 100);
  assert.equal(videoProgressPercent(progress(300), null), 0);
});

test('最初に開くビデオ: 指定があればそれ、無ければ見終えていない最初のビデオ、全部見終えたら先頭', () => {
  const s = sections([video('a', progress(600, DONE)), video('b', progress(30))], [video('c')]);
  assert.equal(pickInitialVideoId(s, 'c'), 'c');
  assert.equal(pickInitialVideoId(s, 'missing'), 'b');
  assert.equal(pickInitialVideoId(s, null), 'b');
  assert.equal(pickInitialVideoId(sections([video('a', progress(1, DONE))]), null), 'a');
  assert.equal(pickInitialVideoId([], null), null);
});

test('見終えた本数: 区切りをまたいで数える', () => {
  const s = sections([video('a', progress(600, DONE)), video('b')], [video('c', progress(10, DONE))]);
  assert.deepEqual(countCompletedVideos(s), { completed: 2, total: 3 });
});
