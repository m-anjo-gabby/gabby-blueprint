import type { Page } from '@playwright/test';
import { openAdminContext } from '../../support/adminApp.ts';
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableCoach,
  createDisposableStudent,
  deleteFixtureChatRooms,
  DISPOSABLE_EMAIL_DOMAIN,
  grantLiveLicense,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { confirmModal, openCoachContext } from '../../support/coachApp.ts';
import { clickUntilVisible } from '../../support/hydration.ts';
import { createPendingMatchingRequest, signOutLivePair, type LivePair } from '../../support/liveSessionFixtures.ts';
import { expect, loginAsNewStudent, test } from '../../support/studentApp.ts';

/**
 * 生徒の「専属コーチを探す」に出るコーチの出し分け（仕様書: e2e/specs/matching/coach-matching.md の前提条件・異常系 #2b、
 * E2Eテストケース候補「一覧に出るコーチの出し分け」）。
 * - コーチ本人の受付（プロフィールの Student matching）・アドミンの休止（ユーザー詳細のマッチング対象）・プロフィールの必須項目で一覧から外れ、
 *   ONに戻す・解除する・そろえると戻る
 * - 外れる前に届いていた申請は、コーチが承認できる
 *
 * 生徒・コーチは使い捨て。比較用に、常に一覧に出るコーチ（A）を並べ、Aが出たこと（＝一覧の描画が終わったこと）を確かめてから対象のコーチ（B）の有無を見る。
 * coach・admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = 'CoachVisible2026a';
const DAY_MS = 24 * 60 * 60 * 1000;
/** 空き時間（UTC の金曜 10:00〜13:00＝日本時間 19:00〜22:00） */
const AVAILABILITY = [{ dayOfWeek: 5, startTime: '10:00:00', endTime: '13:00:00' }];

let fixture: AuthFixture | undefined;
let pair: LivePair | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    '使い捨てデータを作り、coach・admin は PC 表示の別コンテキストで開くため desktop だけで実行する',
  );
});

test.afterEach(async () => {
  await signOutLivePair(pair);
  pair = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** コーチのカード（プロフィールを開くボタンの読み上げ名で特定する） */
const coachCard = (page: Page, coachName: string) => page.getByLabel(`${coachName}のプロフィールを見る`);

/** 「専属コーチを探す」を開き直し、使い捨てのコーチだけに絞って、比較用のコーチが出るまで待つ */
async function openCoachSearch(page: Page, tag: string, controlCoachName: string): Promise<void> {
  await page.goto('/coach-matching');
  // 骨組みも本物の検索欄を描くため、本番の画面（見出しの説明文）に置き換わってから入力する
  await expect(page.getByText(/回のセッション枠ごとにコーチをリクエストできます/)).toBeVisible();
  await page.getByPlaceholder('コーチ名で検索').fill(tag);
  await expect(coachCard(page, controlCoachName)).toBeVisible();
}

test('本人の受付OFF・アドミンの休止・必須項目の未設定で一覧から外れ、戻すと再び出る', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const f = await createAuthFixture('coachvisible');
  fixture = f;
  const studentEmail = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password: PASSWORD });
  await grantLiveLicense(f, studentId, {
    planCode: 'LIVE_WEEKLY1_3M',
    label: 'live',
    start: new Date(Date.now() - DAY_MS),
    end: new Date(Date.now() + 90 * DAY_MS),
  });
  const coachA = `E2E Coach A ${f.tag}`;
  const coachB = `E2E Coach B ${f.tag}`;
  await createDisposableCoach(f, {
    email: `${f.tag}-coach-a@${DISPOSABLE_EMAIL_DOMAIN}`,
    password: PASSWORD,
    userName: coachA,
    timezone: 'Asia/Tokyo',
    availability: AVAILABILITY,
  });
  const coachBEmail = `${f.tag}-coach-b@${DISPOSABLE_EMAIL_DOMAIN}`;
  const coachBId = await createDisposableCoach(f, {
    email: coachBEmail,
    password: PASSWORD,
    userName: coachB,
    timezone: 'Asia/Tokyo',
    availability: AVAILABILITY,
  });

  await loginAsNewStudent(page, studentEmail, PASSWORD);
  await openCoachSearch(page, f.tag, coachA);
  await expect(coachCard(page, coachB)).toBeVisible();

  const coachApp = await openCoachContext(browser, { email: coachBEmail, password: PASSWORD });
  const adminApp = await openAdminContext(browser);
  try {
    const coachPage = coachApp.page;
    const matchingCard = coachPage
      .locator('section')
      .filter({ has: coachPage.getByRole('heading', { level: 2, name: 'Student matching' }) });
    const acceptSwitch = matchingCard.getByRole('switch', { name: 'Accept new students' });
    await coachPage.goto('/profile');
    await expect(matchingCard).toContainText('Visible to students');

    await test.step('コーチ本人が受付をOFFにすると外れ、ONに戻すと出る', async () => {
      await acceptSwitch.click();
      await expect(coachPage.getByText('You are no longer accepting new students')).toBeVisible();
      await expect(matchingCard).toContainText('Not visible to students');
      await openCoachSearch(page, f.tag, coachA);
      await expect(coachCard(page, coachB)).toHaveCount(0);

      await acceptSwitch.click();
      await expect(coachPage.getByText('You are now accepting new students')).toBeVisible();
      await expect(matchingCard).toContainText('Visible to students');
      await openCoachSearch(page, f.tag, coachA);
      await expect(coachCard(page, coachB)).toBeVisible();
    });

    await test.step('アドミンが休止すると外れ（コーチには理由のメモを出さない）、解除すると出る', async () => {
      const adminPage = adminApp.page;
      const suspendSwitch = adminPage.getByRole('switch', { name: 'アドミンによる休止' });
      const note = `長期休暇のため（${f.tag}）`;
      await adminPage.goto(`/users/${coachBId}/matching`);
      await expect(adminPage.getByText('生徒のコーチ選択に表示中')).toBeVisible();
      await clickUntilVisible(
        suspendSwitch,
        adminPage.getByLabel('休止の理由（運営の内部メモ。コーチには表示されません）'),
      );
      await adminPage.getByLabel('休止の理由（運営の内部メモ。コーチには表示されません）').fill(note);
      await adminPage.getByRole('button', { name: '保存' }).click();
      await expect(adminPage.getByText('マッチングを休止しました')).toBeVisible();
      await expect(adminPage.getByText(/から休止中$/)).toBeVisible();
      await expect(adminPage.getByText('生徒のコーチ選択に非表示')).toBeVisible();

      await coachPage.reload();
      await expect(matchingCard).toContainText('Matching has been paused by the Gabby team.');
      await expect(matchingCard).toContainText('Not visible to students');
      await expect(coachPage.getByText(note)).toHaveCount(0);
      await openCoachSearch(page, f.tag, coachA);
      await expect(coachCard(page, coachB)).toHaveCount(0);

      await suspendSwitch.click();
      await adminPage.getByRole('button', { name: '保存' }).click();
      await expect(adminPage.getByText('マッチングの休止を解除しました')).toBeVisible();
      await expect(adminPage.getByText('生徒のコーチ選択に表示中')).toBeVisible();
      const { count } = await f.admin
        .from('com_m_coach_matching_suspension')
        .select('coach_id', { count: 'exact', head: true })
        .eq('coach_id', coachBId);
      expect(count).toBe(0);
      await openCoachSearch(page, f.tag, coachA);
      await expect(coachCard(page, coachB)).toBeVisible();
    });

    await test.step('必須項目（自己紹介）が欠けると外れ、そろえると出る', async () => {
      const { data: profile } = await f.admin
        .from('com_m_coach_profile')
        .select('introduction')
        .eq('user_id', coachBId)
        .single();
      await f.admin.from('com_m_coach_profile').update({ introduction: ' ' }).eq('user_id', coachBId);
      await coachPage.reload();
      await expect(matchingCard).toContainText('Complete the following to appear in the coach search:');
      await expect(matchingCard.getByRole('listitem')).toHaveCount(1);
      await expect(matchingCard.getByRole('listitem')).toContainText('Personal introduction');
      await openCoachSearch(page, f.tag, coachA);
      await expect(coachCard(page, coachB)).toHaveCount(0);

      await f.admin.from('com_m_coach_profile').update({ introduction: profile!.introduction }).eq('user_id', coachBId);
      await coachPage.reload();
      await expect(matchingCard).toContainText('Visible to students');
      await openCoachSearch(page, f.tag, coachA);
      await expect(coachCard(page, coachB)).toBeVisible();
    });
  } finally {
    await coachApp.context.close();
    await adminApp.context.close();
  }
});

test('一覧から外れる前に届いていた申請は、受付OFF・休止中でもコーチが承認できる（#2b）', async ({ browser }) => {
  const f = await createAuthFixture('coachpaused');
  fixture = f;
  pair = await createPendingMatchingRequest(f, PASSWORD);
  // 申請の後に、コーチ本人が受付をOFFにし、アドミンも休止する
  await f.admin.from('com_m_coach_profile').update({ accepting_students: false }).eq('user_id', pair.coachId);
  const { error } = await f.admin
    .from('com_m_coach_matching_suspension')
    .insert({ coach_id: pair.coachId, note: `E2E（${f.tag}）` });
  if (error) throw new Error(`休止の設定に失敗しました: ${error.message}`);

  const { context, page } = await openCoachContext(browser, { email: pair.coachEmail, password: PASSWORD });
  try {
    await page.goto('/matching-requests');
    const pendingSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: /^Pending \(\d+\)$/ }) });
    const card = pendingSection.locator('article').filter({ hasText: pair.studentName });
    const modal = confirmModal(page);
    await clickUntilVisible(card.getByRole('button', { name: 'Approve' }), modal);
    await modal.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText('Request approved. Sessions have been booked.')).toBeVisible();

    const { data: request } = await f.admin
      .from('com_t_matching_request')
      .select('status')
      .eq('request_id', pair.requestId)
      .single();
    expect(request?.status).toBe(2);
    const { count } = await f.admin
      .from('com_m_lesson_schedule')
      .select('schedule_id', { count: 'exact', head: true })
      .eq('ticket_id', pair.ticketId);
    expect(count).toBe(1);
  } finally {
    await context.close();
  }
});
