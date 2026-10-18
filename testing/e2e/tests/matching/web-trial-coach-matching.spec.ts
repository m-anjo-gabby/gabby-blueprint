import type { Page } from '@playwright/test';
import { openAdminContext } from '../../support/adminApp.ts';
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableCoach,
  createDisposableStudent,
  grantLiveLicense,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { openCoachContext } from '../../support/coachApp.ts';
import { signInAsRole } from '../../../helpers/auth.ts';
import { expect, loginAsNewStudent, test } from '../../support/studentApp.ts';

/**
 * Webトライアルのプランの生徒のコーチ検索（仕様書: e2e/specs/matching/coach-matching.md の前提条件・異常系 #2c、
 * E2Eテストケース候補「Webトライアルの生徒のコーチ検索」）。
 * - アドミンがユーザー編集で「Webトライアル担当」を付けたコーチだけが、Webトライアルの生徒の一覧に出る（担当のコーチは通常の生徒にも出る）
 * - Webトライアルの生徒からの申請には、コーチの申請一覧で "Web Trial" の目印が付く（通常の生徒の申請には付かない）
 *
 * 生徒・コーチは使い捨て（ロールの付与もユーザーの削除で消える）。coach・admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = 'WebTrialMatch2026a';
const DAY_MS = 24 * 60 * 60 * 1000;
/** 空き時間（UTC の金曜 10:00〜13:00＝日本時間 19:00〜22:00） */
const AVAILABILITY = [{ dayOfWeek: 5, startTime: '10:00:00', endTime: '13:00:00' }];
const TRIAL_ROLE_NAME = 'Webトライアル担当';

let fixture: AuthFixture | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    '使い捨てデータを作り、coach・admin は PC 表示の別コンテキストで開くため desktop だけで実行する',
  );
});

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** コーチのカード（プロフィールを開くボタンの読み上げ名で特定する） */
const coachCard = (page: Page, coachName: string) => page.getByLabel(`${coachName}のプロフィールを見る`);

/** 「専属コーチを探す」を開き、使い捨てのコーチだけに絞る（本番の画面に置き換わってから入力する） */
async function openCoachSearch(page: Page, tag: string): Promise<void> {
  await page.goto('/coach-matching');
  await expect(page.getByText(/回のセッション枠ごとにコーチをリクエストできます/)).toBeVisible();
  await page.getByPlaceholder('コーチ名で検索').fill(tag);
}

/** 使い捨ての生徒（日本時間）にライブ付きのライセンスを付ける */
async function createStudentWithPlan(f: AuthFixture, key: string, planCode: string, days: number) {
  const email = `${f.tag}-${key}@${DISPOSABLE_EMAIL_DOMAIN}`;
  const userName = `E2E生徒${key} ${f.tag}`;
  const userId = await createDisposableStudent(f, { email, password: PASSWORD, userName });
  await f.admin.from('com_m_user').update({ timezone: 'Asia/Tokyo' }).eq('id', userId);
  const { ticketId } = await grantLiveLicense(f, userId, {
    planCode,
    label: key,
    start: new Date(Date.now() - DAY_MS),
    end: new Date(Date.now() + days * DAY_MS),
  });
  return { email, userName, userId, ticketId };
}

test('Webトライアルの生徒には「Webトライアル担当」のコーチだけが出て、担当のコーチは通常の生徒にも出る', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const f = await createAuthFixture('trialcoach');
  fixture = f;
  const trial = await createStudentWithPlan(f, 'trial', 'WEB_TRIAL', 13);
  const regular = await createStudentWithPlan(f, 'regular', 'LIVE_WEEKLY1_3M', 90);
  const trialCoach = `E2E Coach Trial ${f.tag}`;
  const otherCoach = `E2E Coach Other ${f.tag}`;
  const trialCoachId = await createDisposableCoach(f, {
    email: `${f.tag}-coach-trial@${DISPOSABLE_EMAIL_DOMAIN}`,
    password: PASSWORD,
    userName: trialCoach,
    timezone: 'Asia/Tokyo',
    availability: AVAILABILITY,
  });
  await createDisposableCoach(f, {
    email: `${f.tag}-coach-other@${DISPOSABLE_EMAIL_DOMAIN}`,
    password: PASSWORD,
    userName: otherCoach,
    timezone: 'Asia/Tokyo',
    availability: AVAILABILITY,
  });

  await test.step('ロールを付ける前は、トライアルの生徒の一覧にコーチが出ない', async () => {
    await loginAsNewStudent(page, trial.email, PASSWORD);
    await openCoachSearch(page, f.tag);
    await expect(page.getByText('現在リクエスト可能なコーチがいません。')).toBeVisible();
    await expect(coachCard(page, trialCoach)).toHaveCount(0);
    await expect(coachCard(page, otherCoach)).toHaveCount(0);
  });

  await test.step('アドミンがユーザー編集でコーチに「Webトライアル担当」を付ける', async () => {
    const adminApp = await openAdminContext(browser);
    try {
      const adminPage = adminApp.page;
      await adminPage.goto(`/users/${trialCoachId}`);
      const roleCheckbox = adminPage.getByRole('checkbox', { name: TRIAL_ROLE_NAME });
      await expect(roleCheckbox).toBeVisible();
      await roleCheckbox.check();
      await adminPage.getByRole('button', { name: '保存', exact: true }).click();
      await expect(adminPage.getByText('ユーザー情報を更新しました')).toBeVisible();
    } finally {
      await adminApp.context.close();
    }
    const { count } = await f.admin
      .from('com_t_user_role')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', trialCoachId)
      .eq('role_id', 'web_trial_coach');
    expect(count).toBe(1);
  });

  await test.step('トライアルの生徒には担当のコーチだけが出る', async () => {
    await openCoachSearch(page, f.tag);
    await expect(coachCard(page, trialCoach)).toBeVisible();
    await expect(coachCard(page, otherCoach)).toHaveCount(0);
  });

  await test.step('通常の生徒には担当のコーチも、担当でないコーチも出る', async () => {
    await page.context().clearCookies();
    await loginAsNewStudent(page, regular.email, PASSWORD);
    await openCoachSearch(page, f.tag);
    await expect(coachCard(page, otherCoach)).toBeVisible();
    await expect(coachCard(page, trialCoach)).toBeVisible();
  });
});

test('Webトライアルの生徒からの申請には、コーチの申請一覧で "Web Trial" の目印が付く', async ({ browser }) => {
  const f = await createAuthFixture('trialtag');
  fixture = f;
  const coachEmail = `${f.tag}-coach@${DISPOSABLE_EMAIL_DOMAIN}`;
  const coachId = await createDisposableCoach(f, {
    email: coachEmail,
    password: PASSWORD,
    userName: `E2E Coach ${f.tag}`,
    timezone: 'Asia/Tokyo',
    availability: AVAILABILITY,
  });
  const { error: roleError } = await f.admin
    .from('com_t_user_role')
    .insert({ user_id: coachId, role_id: 'web_trial_coach' });
  if (roleError) throw new Error(`ロールの付与に失敗しました: ${roleError.message}`);

  // トライアルの生徒と通常の生徒が、同じコーチへ申請する（申請は生徒本人のログインで登録する）
  for (const [key, planCode, days] of [
    ['trial', 'WEB_TRIAL', 13],
    ['regular', 'LIVE_WEEKLY1_3M', 90],
  ] as const) {
    const student = await createStudentWithPlan(f, key, planCode, days);
    const client = await signInAsRole(student.email, PASSWORD);
    const { error } = await client.from('com_t_matching_request').insert({
      ticket_id: student.ticketId,
      student_id: student.userId,
      coach_id: coachId,
      slot_no: 1,
      requested_day_of_week: 5,
      requested_start_time: '20:00:00',
      requested_end_time: '20:25:00',
      requested_timezone: 'Asia/Tokyo',
    });
    await client.auth.signOut();
    if (error) throw new Error(`申請の登録に失敗しました（${key}）: ${error.message}`);
  }

  const { context, page } = await openCoachContext(browser, { email: coachEmail, password: PASSWORD });
  try {
    await page.goto('/matching-requests');
    const pendingSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: /^Pending \(\d+\)$/ }) });
    const trialCard = pendingSection.locator('article').filter({ hasText: `E2E生徒trial ${f.tag}` });
    const regularCard = pendingSection.locator('article').filter({ hasText: `E2E生徒regular ${f.tag}` });
    await expect(trialCard).toBeVisible();
    await expect(regularCard).toBeVisible();
    await expect(trialCard.getByText('Web Trial', { exact: true })).toBeVisible();
    await expect(regularCard.getByText('Web Trial', { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
