import type { Page } from '@playwright/test';
import { openAdminContext } from '../../support/adminApp.ts';
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableCoach,
  createDisposableStudent,
  DISPOSABLE_EMAIL_DOMAIN,
  grantLiveLicense,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { openCoachContext } from '../../support/coachApp.ts';
import {
  addRatingStudent,
  createRatingCoach,
  insertCoachRating,
  type RatingStudent,
} from '../../support/coachRatingFixtures.ts';
import { clickUntilVisible } from '../../support/hydration.ts';
import { openLiveRoom } from '../../support/liveRoomView.ts';
import { expect, loginAsNewStudent, test } from '../../support/studentApp.ts';

/**
 * コーチ評価（仕様書: e2e/specs/rating/coach-rating.md の優先度「高」「中」）。
 * - 評価の登録と反映: 生徒の評価ダイアログ → 評価のお願いが消える → コーチの My Rating → アドミンの評価画面
 * - 受付の条件: 終了まで14日以内／予定なし／受付期間前／評価済み／実施済みなし の各生徒で、評価のお願いの有無を確かめる
 * - 同じコーチの複数コマ・「あとで」: 週2回で2コマとも同じコーチでも評価のお願いは1行・評価は1件。「あとで」で閉じても残る
 * - コーチ選択の表示: 評価のあるコーチのカード・プロフィールに総合評価と件数が出て、評価0件のコーチには出ない
 *
 * コーチ・生徒は使い捨て（support/coachRatingFixtures.ts）。コーチは作成時に初期値の評価（4/4/4）を1件持つ。
 * coach・admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = 'CoachRating2026a';

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

/** ライブセッション管理の「対応が必要です」の評価のお願い（コーチごとに1行） */
const ratingNotice = (page: Page, coachName: string) => page.getByText(`${coachName}コーチの評価をお願いします`);

test('評価を送信すると、評価のお願いが消え、コーチの My Rating とアドミンの評価画面に反映される', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const f = await createAuthFixture('ratingsubmit');
  fixture = f;
  const coach = await createRatingCoach(f, PASSWORD);
  // 契約の終了まで10日・実施済み1回・予定1回 → 受付期間中（終了14日前）
  const student = await addRatingStudent(f, coach, PASSWORD, {
    key: 'ra',
    slotNo: 1,
    endInDays: 10,
    completed: 1,
    scheduled: 1,
  });
  const feedback = `進め方が分かりやすかったです（${f.tag}）`;

  const coachApp = await openCoachContext(browser, { email: coach.coachEmail, password: PASSWORD });
  try {
    // 評価前: 初期値の1件だけ（総合4.0）
    await expect(coachApp.page.getByText('My Rating', { exact: true })).toBeVisible();
    await expect(coachApp.page.getByText('1 rating', { exact: true })).toBeVisible();

    // 生徒: ホームのライブセッションのカードから、対象の契約のライブセッション管理へ
    await loginAsNewStudent(page, student.studentEmail, PASSWORD);
    await page.getByRole('link', { name: /専属コーチの評価をお願いします（1件）/ }).click();
    await page.waitForURL(`**/live-room?contract=${student.ticketId}`);
    await expect(ratingNotice(page, coach.coachName)).toBeVisible();

    const dialog = page.getByRole('dialog', { name: 'コーチの評価にご協力ください' });
    await clickUntilVisible(page.getByRole('button', { name: '評価する' }), dialog);
    await expect(dialog).toContainText(coach.coachName);
    const submit = dialog.getByRole('button', { name: '送信する' });
    // 3項目が揃うまで送信できない
    await expect(submit).toBeDisabled();
    await dialog.getByRole('radiogroup', { name: 'コーチング' }).getByRole('radio', { name: '5点' }).click();
    await dialog.getByRole('radiogroup', { name: '親近感' }).getByRole('radio', { name: '5点' }).click();
    await expect(submit).toBeDisabled();
    await dialog.getByRole('radiogroup', { name: 'おすすめ度' }).getByRole('radio', { name: '5点' }).click();
    await expect(submit).toBeEnabled();
    // 前後の空白は除いて登録される
    await dialog.getByRole('textbox').fill(`  ${feedback}  `);
    await submit.click();

    await expect(page.getByText('評価を送信しました。ご協力ありがとうございます。')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(ratingNotice(page, coach.coachName)).toHaveCount(0);

    const { data: rating } = await f.admin
      .from('com_t_coach_rating')
      .select('coaching_score, friendliness_score, recommendation_score, feedback, source')
      .eq('ticket_id', student.ticketId)
      .eq('coach_id', coach.coachId)
      .single();
    expect(rating).toMatchObject({
      coaching_score: 5,
      friendliness_score: 5,
      recommendation_score: 5,
      feedback,
      source: 1,
    });

    // 開き直しても評価のお願いは出ない
    await openLiveRoom(page);
    await expect(page.getByRole('img', { name: /^実施済み\d+回、/ })).toBeVisible();
    await expect(ratingNotice(page, coach.coachName)).toHaveCount(0);

    // コーチ: 集計がすぐに作り直される（初期値4/4/4 と 5/5/5 → 総合・各項目とも4.5、2件）
    await coachApp.page.reload();
    await expect(coachApp.page.getByText('2 ratings', { exact: true })).toBeVisible();
    await expect(coachApp.page.getByRole('img', { name: '4.5 out of 5' })).toHaveCount(3);
  } finally {
    await coachApp.context.close();
  }

  // アドミン: コーチの評価タブに評価の行と運営へのコメントが出る。「コメントあり」で絞り込める
  const adminApp = await openAdminContext(browser);
  try {
    await adminApp.page.goto(`/users/${coach.coachId}/ratings`);
    await expect(adminApp.page.getByText('2件の評価', { exact: false })).toBeVisible();
    const studentRow = adminApp.page.getByRole('row').filter({ hasText: student.studentName });
    await expect(studentRow).toContainText(feedback);
    await expect(studentRow).toContainText(student.studentEmail);
    await expect(adminApp.page.getByRole('row').filter({ hasText: '初期値' })).toHaveCount(1);

    await adminApp.page.getByRole('link', { name: 'コメントあり（1）' }).click();
    await adminApp.page.waitForURL(`**/users/${coach.coachId}/ratings?feedback=1`);
    await expect(studentRow).toBeVisible();
    await expect(adminApp.page.getByRole('row').filter({ hasText: '初期値' })).toHaveCount(0);
  } finally {
    await adminApp.context.close();
  }
});

test('評価のお願いは、終了14日以内または予定が残っていない未評価の契約にだけ出る', async ({ page }) => {
  test.setTimeout(240_000);
  const f = await createAuthFixture('ratingtarget');
  fixture = f;
  const coach = await createRatingCoach(f, PASSWORD);
  const add = (key: string, slotNo: number, p: { endInDays: number; completed: number; scheduled: number }) =>
    addRatingStudent(f, coach, PASSWORD, { key, slotNo, ...p });

  const cases: { student: RatingStudent; label: string; expected: boolean }[] = [
    // 異常系 #3: 実施済み1回・予定あり・終了まで10日 → 出る
    {
      student: await add('near', 1, { endInDays: 10, completed: 1, scheduled: 1 }),
      label: '終了14日以内',
      expected: true,
    },
    // 異常系 #4: 実施済み1回・予定なし・終了まで76日 → 出る
    { student: await add('done', 2, { endInDays: 76, completed: 1, scheduled: 0 }), label: '予定なし', expected: true },
    // 異常系 #2: 実施済み1回・予定あり・終了まで76日 → 出ない（受付期間前）
    {
      student: await add('early', 3, { endInDays: 76, completed: 1, scheduled: 2 }),
      label: '受付期間前',
      expected: false,
    },
    // 異常系 #1: 実施済みなし・予定なし → 出ない
    {
      student: await add('none', 4, { endInDays: 10, completed: 0, scheduled: 0 }),
      label: '実施済みなし',
      expected: false,
    },
  ];
  // 評価済み（終了まで10日・実施済み1回）→ 出ない
  const rated = await add('rated', 5, { endInDays: 10, completed: 1, scheduled: 1 });
  await insertCoachRating(f, coach, rated, { coaching: 4, friendliness: 4, recommendation: 4 });
  cases.push({ student: rated, label: '評価済み', expected: false });

  for (const c of cases) {
    await test.step(`${c.label}: 評価のお願いが${c.expected ? '出る' : '出ない'}`, async () => {
      await page.context().clearCookies();
      await loginAsNewStudent(page, c.student.studentEmail, PASSWORD);
      const homeAction = page.getByRole('link', { name: /専属コーチの評価をお願いします（1件）/ });
      await openLiveRoom(page);
      if (c.expected) {
        await expect(ratingNotice(page, coach.coachName)).toBeVisible();
        await expect(page.getByRole('button', { name: '評価する' })).toHaveCount(1);
        await page.goto('/dashboard');
        await expect(homeAction).toBeVisible();
      } else {
        // データの描画が終わったこと（契約の状況の回数の内訳。骨組みには無い）を確かめてから、出ていないことを確かめる
        await expect(page.getByRole('img', { name: /^実施済み\d+回、/ })).toBeVisible();
        await expect(ratingNotice(page, coach.coachName)).toHaveCount(0);
      }
    });
  }
});

test('週2回で2コマとも同じコーチでも評価のお願いは1行だけで、「あとで」で閉じても残り、評価は1件になる', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const f = await createAuthFixture('ratingtwoslot');
  fixture = f;
  const coach = await createRatingCoach(f, PASSWORD);
  // 週2回・2コマとも同じコーチ・各コマで実施済み1回と予定1回・終了まで10日 → 受付期間中
  const student = await addRatingStudent(f, coach, PASSWORD, {
    key: 'two',
    slotNo: 1,
    endInDays: 10,
    completed: 1,
    scheduled: 1,
    weeklySlots: 2,
  });
  const ratingCount = async () => {
    const { count } = await f.admin
      .from('com_t_coach_rating')
      .select('rating_id', { count: 'exact', head: true })
      .eq('ticket_id', student.ticketId);
    return count;
  };

  await loginAsNewStudent(page, student.studentEmail, PASSWORD);

  await test.step('ホームとライブセッション管理に、評価のお願いが1件（1行）だけ出る', async () => {
    await expect(page.getByRole('link', { name: /専属コーチの評価をお願いします（1件）/ })).toBeVisible();
    await openLiveRoom(page);
    await expect(ratingNotice(page, coach.coachName)).toHaveCount(1);
    await expect(page.getByRole('button', { name: '評価する' })).toHaveCount(1);
  });

  const dialog = page.getByRole('dialog', { name: 'コーチの評価にご協力ください' });

  await test.step('「あとで」で閉じると何も登録されず、開き直しても評価のお願いが残る', async () => {
    await clickUntilVisible(page.getByRole('button', { name: '評価する' }), dialog);
    await dialog.getByRole('radiogroup', { name: 'コーチング' }).getByRole('radio', { name: '3点' }).click();
    await dialog.getByRole('button', { name: 'あとで' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(ratingNotice(page, coach.coachName)).toBeVisible();
    expect(await ratingCount()).toBe(0);

    await openLiveRoom(page);
    await expect(ratingNotice(page, coach.coachName)).toHaveCount(1);
  });

  await test.step('送信すると評価は1件だけ登録され、評価のお願いが消える', async () => {
    await clickUntilVisible(page.getByRole('button', { name: '評価する' }), dialog);
    const submit = dialog.getByRole('button', { name: '送信する' });
    // 閉じる前の選択は残らない（3項目そろうまで送信できない）
    await expect(submit).toBeDisabled();
    for (const item of ['コーチング', '親近感', 'おすすめ度']) {
      await dialog.getByRole('radiogroup', { name: item }).getByRole('radio', { name: '4点' }).click();
    }
    await submit.click();
    await expect(page.getByText('評価を送信しました。ご協力ありがとうございます。')).toBeVisible();
    await expect(ratingNotice(page, coach.coachName)).toHaveCount(0);
    expect(await ratingCount()).toBe(1);
  });
});

test('コーチ選択のカード・プロフィールに総合評価と件数が出て、評価0件のコーチには出ない', async ({ page }) => {
  test.setTimeout(180_000);
  const f = await createAuthFixture('ratingcard');
  fixture = f;
  const studentEmail = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password: PASSWORD });
  const DAY_MS = 24 * 60 * 60 * 1000;
  await grantLiveLicense(f, studentId, {
    planCode: 'LIVE_WEEKLY1_3M',
    label: 'live',
    start: new Date(Date.now() - DAY_MS),
    end: new Date(Date.now() + 90 * DAY_MS),
  });

  // 一覧に出るコーチ（必須項目・空き時間あり）を2人。作成時に初期値の評価（4/4/4）が1件ずつ入る
  const availability = [{ dayOfWeek: 5, startTime: '10:00:00', endTime: '13:00:00' }];
  const ratedName = `E2E Coach Rated ${f.tag}`;
  const unratedName = `E2E Coach Unrated ${f.tag}`;
  const ratedId = await createDisposableCoach(f, {
    email: `${f.tag}-coach-r@${DISPOSABLE_EMAIL_DOMAIN}`,
    password: PASSWORD,
    userName: ratedName,
    timezone: 'Asia/Tokyo',
    availability,
  });
  const unratedId = await createDisposableCoach(f, {
    email: `${f.tag}-coach-u@${DISPOSABLE_EMAIL_DOMAIN}`,
    password: PASSWORD,
    userName: unratedName,
    timezone: 'Asia/Tokyo',
    availability,
  });
  // 評価あり: 移行元の評価（5/5/5）を足して「4.5・2件」。評価なし: 初期値の評価を消して0件にする（集計はトリガーで作り直される）
  const { error: insertError } = await f.admin
    .from('com_t_coach_rating')
    .insert({ coach_id: ratedId, coaching_score: 5, friendliness_score: 5, recommendation_score: 5, source: 2 });
  if (insertError) throw new Error(`評価の登録に失敗しました: ${insertError.message}`);
  const { error: deleteError } = await f.admin.from('com_t_coach_rating').delete().eq('coach_id', unratedId);
  if (deleteError) throw new Error(`評価の削除に失敗しました: ${deleteError.message}`);

  await loginAsNewStudent(page, studentEmail, PASSWORD);
  await page.goto('/coach-matching');
  await page.getByPlaceholder('コーチ名で検索').fill(f.tag);

  const card = (name: string) =>
    page.locator('article').filter({ has: page.getByLabel(`${name}のプロフィールを見る`) });

  await test.step('評価のあるコーチのカードに総合評価と件数が出る', async () => {
    await expect(card(ratedName)).toBeVisible();
    await expect(card(ratedName).getByText('4.5', { exact: true })).toBeVisible();
    await expect(card(ratedName).getByText('（2件の評価）')).toBeVisible();
  });

  await test.step('評価0件のコーチのカードには出ない', async () => {
    await expect(card(unratedName)).toBeVisible();
    await expect(card(unratedName).getByText(/件の評価/)).toHaveCount(0);
  });

  await test.step('プロフィールにも総合評価と件数が出る', async () => {
    const profile = page.getByRole('dialog', { name: ratedName });
    await clickUntilVisible(page.getByLabel(`${ratedName}のプロフィールを見る`), profile);
    await expect(profile.getByText(/2件の評価/)).toBeVisible();
  });
});
