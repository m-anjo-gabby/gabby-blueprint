import type { Page } from '@playwright/test';
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  DISPOSABLE_EMAIL_DOMAIN,
  grantAppLicense,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { clickUntilVisible } from '../../support/hydration.ts';
import { expect, loginAsNewStudent, test } from '../../support/studentApp.ts';
import {
  cleanupVideoContents,
  newVideoContentTag,
  seedVideoContent,
  videoContentName,
  type SeededVideoContent,
} from '../../support/videoFixtures.ts';

/**
 * 生徒のビデオ教材（仕様書: e2e/specs/training/video-training.md）。
 * 使い捨ての生徒と、その顧客にだけ公開したビデオ教材で確かめる。Windows の WebKit は H.264 の動画を再生できないため desktop だけで実行する。
 */

const PASSWORD = 'VideoTraining2026a';

let fixture: AuthFixture | undefined;
let contentIds: string[] = [];

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Windows の WebKit は H.264 の動画を再生できないため desktop だけで実行する',
  );
  contentIds = [];
});

test.afterEach(async () => {
  const admin = fixture?.admin;
  // 視聴の記録が残っているとビデオを消せないため、生徒を先に消す
  await cleanupAuthFixture(fixture);
  fixture = undefined;
  if (admin) await cleanupVideoContents(admin, contentIds);
});

/** 使い捨ての生徒（アプリのライセンス付き）と、その顧客にだけ公開したビデオ教材を作ってログインする */
async function setup(page: Page): Promise<{ seeded: SeededVideoContent; studentId: string; tag: string }> {
  fixture = await createAuthFixture('videostudent');
  const email = `${fixture.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentId = await createDisposableStudent(fixture, { email, password: PASSWORD });
  await grantAppLicense(fixture, studentId);
  const tag = newVideoContentTag();
  const seeded = await seedVideoContent(
    fixture.admin,
    tag,
    [
      {
        name: 'Unit 1',
        videos: [
          { title: 'E2E 1-1 short', status: 1 },
          { title: 'E2E 1-2 long', status: 1, file: 'twenty' },
        ],
      },
      {
        name: 'Unit 2',
        videos: [
          { title: 'E2E 2-1', status: 1 },
          { title: 'E2E 2-2 hidden', status: 0 },
        ],
      },
      // 公開中のビデオが無いセクションは出さない
      { name: 'Unit 3', videos: [{ title: 'E2E 3-1 hidden', status: 0 }] },
    ],
    { published: true, accessClientId: fixture.clientId },
  );
  contentIds.push(seeded.contentId);
  await loginAsNewStudent(page, email, PASSWORD);
  return { seeded, studentId, tag };
}

const videoIdOf = (seeded: SeededVideoContent, title: string) =>
  seeded.sections.flatMap((s) => s.videos).find((v) => v.title === title)!.videoId;
const listItem = (page: Page, title: string) =>
  page.getByRole('navigation', { name: 'ビデオの一覧' }).getByRole('button', { name: new RegExp(title) });
const player = (page: Page) => page.locator('video');

/** 再生中の動画を音なしで再生する（自動再生の制限を避けるため） */
async function play(page: Page) {
  await expect.poll(() => player(page).evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await player(page).evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    return v.play();
  });
}

test('教材一覧から開き、最後まで見ると視聴済みになる（非公開のビデオ・公開中のビデオが無いセクションは出さない）', async ({
  page,
}) => {
  const { seeded, studentId, tag } = await setup(page);

  await page.goto('/library');
  const card = page.locator('div.group').filter({ hasText: videoContentName(tag) });
  await clickUntilVisible(
    card.getByRole('button', { name: 'トレーニングを始める' }),
    page.getByRole('heading', { level: 1, name: 'ビデオ', exact: true }),
  );
  await page.waitForURL(new RegExp(`/training/video/${seeded.contentId}`), { timeout: 60_000 });

  // 見ていない最初のビデオが開く
  await expect(listItem(page, 'E2E 1-1 short')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { level: 2, name: 'E2E 1-1 short' })).toBeVisible();
  await expect(page.getByText('0 / 3 本 視聴済み')).toBeVisible();
  await expect(page.getByText('E2E 2-2 hidden')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Unit 3' })).toHaveCount(0);

  await play(page);
  await expect(page.getByText('1 / 3 本 視聴済み')).toBeVisible({ timeout: 15_000 });
  await expect(listItem(page, 'E2E 1-1 short')).toContainText('視聴済み');
  await expect
    .poll(async () => {
      const { data } = await fixture!.admin
        .from('student_m_video_progress')
        .select('completed_at')
        .eq('user_id', studentId)
        .eq('video_id', videoIdOf(seeded, 'E2E 1-1 short'))
        .maybeSingle();
      return !!data?.completed_at;
    })
    .toBe(true);

  // 次のビデオへ（URL だけが変わる）
  await page.getByRole('button', { name: '次のビデオへ' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?v=${videoIdOf(seeded, 'E2E 1-2 long')}$`));
  await expect(listItem(page, 'E2E 1-2 long')).toHaveAttribute('aria-current', 'true');
});

test('続きの位置から再生し、途中の位置を保存する。選び直しは自動で再生せず、戻るは教材を開く前の画面へ', async ({
  page,
}) => {
  const { seeded, studentId } = await setup(page);
  const longId = videoIdOf(seeded, 'E2E 1-2 long');
  const { error } = await fixture!.admin
    .from('student_m_video_progress')
    .insert({ user_id: studentId, video_id: longId, last_position_sec: 10 });
  expect(error).toBeNull();

  await page.goto('/library');
  await page.goto(`/training/video/${seeded.contentId}?v=${longId}`);
  await expect(listItem(page, 'E2E 1-2 long')).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => player(page).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(10);

  // 一時停止で今の位置を保存する
  await play(page);
  await expect.poll(() => player(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(11);
  const pausedAt = await player(page).evaluate((v: HTMLVideoElement) => {
    v.pause();
    return Math.round(v.currentTime);
  });
  await expect
    .poll(async () => {
      const { data } = await fixture!.admin
        .from('student_m_video_progress')
        .select('last_position_sec, completed_at')
        .eq('user_id', studentId)
        .eq('video_id', longId)
        .single();
      return data;
    })
    .toEqual({ last_position_sec: pausedAt, completed_at: null });

  // 一覧から選び直しても自動では再生しない
  await listItem(page, 'E2E 2-1').click();
  await expect(page).toHaveURL(new RegExp(`\\?v=${videoIdOf(seeded, 'E2E 2-1')}$`));
  await expect(page.getByRole('heading', { level: 2, name: 'E2E 2-1' })).toBeVisible();
  await expect.poll(() => player(page).evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  expect(await player(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  // 選び直した前のビデオは続きの位置から
  await listItem(page, 'E2E 1-2 long').click();
  await expect(listItem(page, 'E2E 1-2 long')).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => player(page).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(pausedAt);
  // 選び直しは履歴に積まないため、戻るは教材を開く前の画面へ戻る
  await page.getByRole('button', { name: '戻る' }).click();
  await page.waitForURL('**/library');
});

test('ブックマークして終了し、ホームの「続きから」で同じビデオの続きから再開する', async ({ page }) => {
  const { seeded, studentId } = await setup(page);
  const longId = videoIdOf(seeded, 'E2E 1-2 long');

  await page.goto(`/training/video/${seeded.contentId}?v=${longId}`);
  await play(page);
  await expect.poll(() => player(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(6);

  await page.getByRole('button', { name: 'ブックマークして終了' }).click();
  await page.getByRole('button', { name: 'OK' }).click();
  await page.waitForURL('**/dashboard');
  const { data: resume } = await fixture!.admin
    .from('com_t_resume_contents')
    .select('content_id, item_id, metadata')
    .eq('user_id', studentId)
    .single();
  expect(resume).toMatchObject({
    content_id: seeded.contentId,
    item_id: longId,
    metadata: { type: 'video', video_id: longId },
  });
  const savedAt = (resume!.metadata as { video_time: number }).video_time;
  expect(savedAt).toBeGreaterThan(5);

  const continueCard = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: '続きから', exact: true }) });
  await expect(continueCard.getByText('ビデオ', { exact: true })).toBeVisible();
  const continueLink = continueCard.getByRole('link');
  await clickUntilVisible(continueLink, page.getByRole('heading', { level: 1, name: 'ビデオ', exact: true }));
  await expect(page).toHaveURL(new RegExp(`/training/video/${seeded.contentId}\\?v=${longId}$`));
  await expect(listItem(page, 'E2E 1-2 long')).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => player(page).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(savedAt);
  // 再開した時点でブックマークは使い終える
  await expect
    .poll(async () => {
      const { count } = await fixture!.admin
        .from('com_t_resume_contents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', studentId);
      return count;
    })
    .toBe(0);
});

test('見えないビデオ教材（非公開・公開先の外）は 404 になる', async ({ page }) => {
  await setup(page);
  const hidden = await seedVideoContent(fixture!.admin, newVideoContentTag(), [
    { name: null, videos: [{ title: 'E2E hidden', status: 1 }] },
  ]);
  contentIds.push(hidden.contentId);

  await page.goto(`/training/video/${hidden.contentId}`);
  await expect(page.getByText('E2E hidden')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
});
