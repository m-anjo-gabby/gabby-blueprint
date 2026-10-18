import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getResumePath, getTrainingPath } from '@gabby/lib/navigation/student-path';
import type { ContentItem } from '@gabby/types/content';
import type { ResumeContentResponse } from '@gabby/types/training';

/**
 * 生徒アプリで教材を開く・続きから始める時の画面のパス（教材の種類ごと）。
 * 種類: 0 単語帳 / 1 ビデオ / 2 スプリント / 3 ダイアログ（packages/types/content.ts の CONTENT_TYPES）
 */

const content = (item: Partial<ContentItem>) => item as ContentItem;
/** スプリントの設定はパスに使う種別だけを入れる */
const sprintMeta = (sprintType: '0' | '1') => ({ sprint: { sprint_type: sprintType } }) as ContentItem['metadata'];
const resume = (contentType: number, itemId: string | null, sprintType?: '0' | '1') =>
  ({
    content_id: 'c1',
    item_id: itemId,
    com_m_contents: {
      content_type: contentType,
      metadata: sprintType ? sprintMeta(sprintType) : {},
    },
  }) as ResumeContentResponse;

test('教材を開く: 種類ごとの画面へ（スプリントは Speed から、ダイアログは自分への割当）', () => {
  assert.equal(getTrainingPath(content({ content_id: 'c1', content_type: 0 })), '/training/word/c1');
  assert.equal(getTrainingPath(content({ content_id: 'c1', content_type: 1 })), '/training/video/c1');
  assert.equal(
    getTrainingPath(content({ content_id: 'c1', content_type: 2, metadata: sprintMeta('1') })),
    '/training/sprint/play?mode=sprint&type=0&content_id=c1&sprint_type=1',
  );
  // スプリントの種別が無ければ汎用（'0'）
  assert.equal(
    getTrainingPath(content({ content_id: 'c1', content_type: 2, metadata: {} })),
    '/training/sprint/play?mode=sprint&type=0&content_id=c1&sprint_type=0',
  );
  assert.equal(
    getTrainingPath(content({ content_id: 'c1', content_type: 3, assignment_id: 'a1' })),
    '/training/dialogue/a1',
  );
});

test('続きから始める: 中断した位置（resume_id）を付ける（スプリントはドリルで再開）', () => {
  assert.equal(getResumePath(resume(0, 'w5')), '/training/word/c1?resume=true&resume_id=w5');
  assert.equal(getResumePath(resume(1, null)), '/training/video/c1?resume=true');
  assert.equal(
    getResumePath(resume(2, 'q9', '1')),
    '/training/sprint/play?mode=drill&type=0&content_id=c1&resume=true&sprint_type=1&resume_id=q9',
  );
  assert.equal(
    getResumePath(resume(2, null)),
    '/training/sprint/play?mode=drill&type=0&content_id=c1&resume=true&sprint_type=0',
  );
});
