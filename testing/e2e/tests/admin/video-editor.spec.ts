import type { Locator, Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '../../../helpers/auth.ts';
import { openAdminContext, openDialogBy } from '../../support/adminApp.ts';
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  DISPOSABLE_EMAIL_DOMAIN,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { expect, test } from '../../support/studentApp.ts';
import {
  cleanupVideoContents,
  findVideoContentIds,
  newVideoContentTag,
  seedVideoContent,
  VIDEO_FILES,
  videoContentName,
  videoFileExists,
} from '../../support/videoFixtures.ts';

/**
 * アドミンのビデオ教材の管理（仕様書: e2e/specs/admin/video-content-management.md）。
 * テストごとに使い捨てのビデオ教材を作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

let admin: SupabaseClient;
let tag: string;
let contentIds: string[] = [];
let fixture: AuthFixture | undefined;

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    '使い捨てデータを作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する',
  );
  admin = await createAdminClient();
  tag = newVideoContentTag();
  contentIds = [];
});

test.afterEach(async () => {
  // 視聴の記録が残っているとビデオを消せないため、生徒を先に消す
  await cleanupAuthFixture(fixture);
  fixture = undefined;
  await cleanupVideoContents(admin, [...new Set([...contentIds, ...(await findVideoContentIds(admin, tag))])]);
});

const sectionCard = (page: Page, heading: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) });
const videoRow = (scope: Page | Locator, title: string) => scope.locator('li').filter({ hasText: title });

async function videoRowOf(videoId: string) {
  const { data } = await admin.from('com_m_video').select('*').eq('video_id', videoId).single();
  return data as {
    section_id: string;
    video_path: string;
    thumbnail_path: string | null;
    duration_sec: number | null;
    seq_no: number;
    status: number;
  };
}

test('教材の作成（ビデオの種類の必須・見出しなしのセクション）とセクションの追加・見出しの変更・並べ替え・削除', async ({
  browser,
}) => {
  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto('/contents');
    const form = await openDialogBy(page, page.getByRole('button', { name: '新規登録' }));
    await form.getByLabel('教材名称', { exact: true }).fill(videoContentName(tag));
    await form.getByLabel('種別').click();
    await page.getByRole('option', { name: 'ビデオ' }).click();
    await form.getByLabel('管理ラベル').fill(tag);
    await form.getByRole('button', { name: '内容を確認する' }).click();
    await expect(form.getByText('ビデオの種類を選択してください')).toBeVisible();
    await form.getByLabel('ビデオの種類').click();
    await page.getByRole('option', { name: 'オンデマンド' }).click();
    await form.getByRole('button', { name: '内容を確認する' }).click();
    await form.getByRole('button', { name: 'はい、確定します' }).click();
    await page.waitForURL(/\/contents\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const contentId = page.url().split('/').pop()!;
    contentIds.push(contentId);

    await expect(page.getByText('1セクション・0本')).toBeVisible();
    await expect(sectionCard(page, '（見出しなし）')).toBeVisible();
    const { data: content } = await admin
      .from('com_m_contents')
      .select('content_type, category_id, status')
      .eq('content_id', contentId)
      .single();
    expect(content).toEqual({ content_type: 1, category_id: 2, status: 0 });

    let dialog = await openDialogBy(page, page.getByRole('button', { name: 'セクションを追加' }));
    await dialog.getByLabel('見出し（日本語）').fill('Unit 2');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('2セクション・0本')).toBeVisible();

    dialog = await openDialogBy(
      page,
      sectionCard(page, '（見出しなし）').getByRole('button', { name: '見出しを変更' }),
    );
    // 英名だけではセクションに見出しを付けられない（見出しの有無は和名で決める）
    await dialog.getByLabel('見出し（英語・任意）').fill('Unit 1 (en)');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('英語の見出しを入れる場合は、日本語の見出しも入力してください')).toBeVisible();
    await dialog.getByLabel('見出し（日本語）').fill('Unit 1');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('見出しを変更しました')).toBeVisible();
    await expect(sectionCard(page, 'Unit 1')).toContainText('Unit 1 (en)');

    await sectionCard(page, 'Unit 2').getByRole('button', { name: '上へ' }).click();
    await expect(page.locator('section').first().getByRole('heading')).toHaveText('Unit 2');
    const { data: sections } = await admin
      .from('com_m_video_section')
      .select('section_name, section_name_en')
      .eq('content_id', contentId)
      .order('seq_no');
    expect(sections).toEqual([
      { section_name: 'Unit 2', section_name_en: null },
      { section_name: 'Unit 1', section_name_en: 'Unit 1 (en)' },
    ]);
    await expect(page.locator('section').first().getByRole('button', { name: '上へ' })).toBeDisabled();

    await sectionCard(page, 'Unit 1').getByRole('button', { name: 'セクションを削除' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
    await expect(page.getByText('セクションを削除しました')).toBeVisible();
    await expect(page.getByText('1セクション・0本')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('ビデオの登録（アップロード・再生時間・サムネイル）・プレビュー・動画の差し替え・サムネイルを外す', async ({
  browser,
}) => {
  const seeded = await seedVideoContent(admin, tag, [{ name: null, videos: [] }]);
  contentIds.push(seeded.contentId);
  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto(`/contents/${seeded.contentId}`);
    let dialog = await openDialogBy(page, page.getByRole('button', { name: 'ビデオを追加' }).first());
    await dialog.getByLabel('タイトル（日本語）').fill('E2E video');
    await dialog.getByLabel('タイトル（英語・任意）').fill('E2E video (en)');
    // 形式の違うファイルは選んだ時点で断る
    await dialog.getByLabel(/動画ファイル/).setInputFiles(VIDEO_FILES.thumbnail);
    await expect(dialog.getByText('このファイルの形式には対応していません')).toBeVisible();
    await dialog.getByLabel(/動画ファイル/).setInputFiles(VIDEO_FILES.short);
    await expect(dialog.getByText('sample-2s.mp4（再生時間 0:02）')).toBeVisible();
    await dialog.getByLabel(/サムネイル/).setInputFiles(VIDEO_FILES.thumbnail);
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('ビデオを追加しました')).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toHaveCount(0);

    const row = videoRow(page, 'E2E video');
    await expect(row).toContainText('0:02');
    await expect(row).toContainText('E2E video (en)');
    await expect(row).toContainText('非公開');
    await expect(row.locator('img')).toBeVisible();
    const { data: created } = await admin
      .from('com_m_video')
      .select('video_id')
      .eq('section_id', seeded.sections[0].sectionId)
      .single();
    const first = await videoRowOf(created!.video_id as string);
    expect(first).toMatchObject({ title_en: 'E2E video (en)', duration_sec: 2, status: 0, seq_no: 1 });
    expect(first.video_path).toMatch(new RegExp(`^${created!.video_id}/[0-9a-f-]{36}\\.mp4$`));
    expect(first.thumbnail_path).toMatch(new RegExp(`^${created!.video_id}/[0-9a-f-]{36}\\.png$`));
    expect(await videoFileExists(first.video_path)).toBe(true);

    // プレビュー（非公開でも再生できる）
    dialog = await openDialogBy(page, row.getByRole('button', { name: 'プレビュー' }));
    const player = dialog.locator('video');
    await expect
      .poll(() => player.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 })
      .toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // 動画の差し替え: 新しいキーになり、古いファイルが消える。サムネイルはそのまま
    dialog = await openDialogBy(page, row.getByRole('button', { name: '編集' }));
    await expect(dialog.getByText('今の動画の再生時間: 0:02。ファイルを選ぶと差し替えます。')).toBeVisible();
    await dialog.getByLabel(/動画ファイル/).setInputFiles(VIDEO_FILES.long);
    await expect(dialog.getByText('sample-3s.mp4（再生時間 0:03）')).toBeVisible();
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('ビデオを更新しました')).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('0:03');
    const replaced = await videoRowOf(created!.video_id as string);
    expect(replaced.video_path).not.toBe(first.video_path);
    expect(replaced.thumbnail_path).toBe(first.thumbnail_path);
    expect(replaced.duration_sec).toBe(3);
    expect(await videoFileExists(replaced.video_path)).toBe(true);
    expect(await videoFileExists(first.video_path)).toBe(false);

    // サムネイルを外す: 列が空になり、ファイルも消える
    dialog = await openDialogBy(page, row.getByRole('button', { name: '編集' }));
    await dialog.getByLabel('サムネイルを外す').check();
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('ビデオを更新しました')).toBeVisible();
    await expect(row.locator('img')).toHaveCount(0);
    expect((await videoRowOf(created!.video_id as string)).thumbnail_path).toBeNull();
    expect(await videoFileExists(first.thumbnail_path!)).toBe(false);
  } finally {
    await context.close();
  }
});

test('ビデオの並べ替え・公開の切り替え・別の教材のセクションへの移動、一覧からエディタへの導線', async ({
  browser,
}) => {
  const source = await seedVideoContent(admin, tag, [
    { name: 'S1', videos: [{ title: 'E2E video 1' }, { title: 'E2E video 2' }] },
  ]);
  const otherTag = newVideoContentTag();
  const target = await seedVideoContent(admin, otherTag, [{ name: 'T1', videos: [] }]);
  contentIds.push(source.contentId, target.contentId);
  const [v1, v2] = source.sections[0].videos;

  const { context, page } = await openAdminContext(browser);
  try {
    // 一覧のビデオ教材の行にもエディタへのボタンがある
    await page.goto(`/contents?q=${encodeURIComponent(tag)}`);
    await expect(page.getByRole('link', { name: 'ビデオを編集' })).toHaveAttribute(
      'href',
      `/contents/${source.contentId}`,
    );

    await page.goto(`/contents/${source.contentId}`);
    const s1 = sectionCard(page, 'S1');
    await expect(videoRow(s1, 'E2E video 1').getByRole('button', { name: '上へ' })).toBeDisabled();
    await videoRow(s1, 'E2E video 2').getByRole('button', { name: '上へ' }).click();
    await expect(s1.locator('li').first()).toContainText('E2E video 2');
    expect((await videoRowOf(v2.videoId)).seq_no).toBe(1);
    expect((await videoRowOf(v1.videoId)).seq_no).toBe(2);

    await videoRow(s1, 'E2E video 1').getByRole('switch').click();
    await expect(page.getByText('公開状態を変更しました')).toBeVisible();
    await expect(videoRow(s1, 'E2E video 1')).toContainText('公開');
    expect((await videoRowOf(v1.videoId)).status).toBe(1);

    // 別の教材のセクションへ移す（今のセクションは選べない）
    const dialog = await openDialogBy(
      page,
      videoRow(s1, 'E2E video 1').getByRole('button', { name: '別のセクションへ移す' }),
    );
    const [contentSelect, sectionSelect] = [dialog.getByRole('combobox').nth(0), dialog.getByRole('combobox').nth(1)];
    await expect(contentSelect).toHaveText(videoContentName(tag));
    await sectionSelect.click();
    await expect(page.getByRole('option', { name: 'S1（今のセクション）' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await contentSelect.click();
    await page.getByRole('option', { name: videoContentName(otherTag) }).click();
    await sectionSelect.click();
    await page.getByRole('option', { name: 'T1' }).click();
    await dialog.getByRole('button', { name: '移す' }).click();
    await expect(page.getByText('ビデオを移しました')).toBeVisible();
    await expect(videoRow(s1, 'E2E video 1')).toHaveCount(0);
    const moved = await videoRowOf(v1.videoId);
    expect(moved).toMatchObject({ section_id: target.sections[0].sectionId, seq_no: 1, status: 1 });
  } finally {
    await context.close();
  }
});

test('ビデオの削除（ファイルも消える）・視聴の記録があるビデオの削除の拒否・ビデオの残るセクションは削除できない', async ({
  browser,
}) => {
  const seeded = await seedVideoContent(admin, tag, [
    { name: 'S1', videos: [{ title: 'E2E watched' }, { title: 'E2E unwatched' }] },
  ]);
  contentIds.push(seeded.contentId);
  const [watched, unwatched] = seeded.sections[0].videos;
  fixture = await createAuthFixture('video');
  const studentId = await createDisposableStudent(fixture, {
    email: `${fixture.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`,
    password: 'VideoEditor2026a',
  });
  const { error } = await admin
    .from('student_m_video_progress')
    .insert({ user_id: studentId, video_id: watched.videoId, last_position_sec: 1 });
  expect(error).toBeNull();

  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto(`/contents/${seeded.contentId}`);
    const s1 = sectionCard(page, 'S1');
    await expect(s1.getByRole('button', { name: 'セクションを削除' })).toBeDisabled();

    await videoRow(s1, 'E2E unwatched').getByRole('button', { name: '削除', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
    await expect(page.getByText('ビデオを削除しました')).toBeVisible();
    await expect(videoRow(s1, 'E2E unwatched')).toHaveCount(0);
    expect(await videoFileExists(unwatched.videoPath)).toBe(false);

    await videoRow(s1, 'E2E watched').getByRole('button', { name: '削除', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
    await expect(page.getByText('視聴の記録があるため削除できません。非公開にしてください')).toBeVisible();
    await expect(videoRow(s1, 'E2E watched')).toBeVisible();
    expect(await videoFileExists(watched.videoPath)).toBe(true);
  } finally {
    await context.close();
  }
});
