import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  cleanupAuthFixture,
  createAuthFixture,
  deleteFixtureChatRooms,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { openCoachContext } from '../../support/coachApp.ts';
import { clickUntilVisible } from '../../support/hydration.ts';
import {
  approveMatchingRequest,
  createPendingMatchingRequest,
  createStaleSessions,
  prepareLiveSessionDay,
  signOutLivePair,
  type LivePair,
} from '../../support/liveSessionFixtures.ts';

/**
 * ライブセッションの終了処理（機能: e2e/specs/session-lifecycle/session-completion.md）。
 * End Session のダイアログで、通話の記録からの推定が初期選択になること、理由が必須になる条件（早期終了・外部のZoom・
 * 推定と違う結果・実施できなかった）と、結果ごとの記録・チケットの消化/返還・通知を確かめる。
 * 推定どおりの実施完了はジャーニー（tests/journeys/coach-live-session.spec.ts）で確かめている。
 * 通話は入退室ログを直接入れて代替する（support/liveSessionFixtures.ts）。coach は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = 'SessionDone2026a';

let fixture: AuthFixture | undefined;
let pair: LivePair | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    '使い捨てデータを作り、coach は PC 表示の別コンテキストで開くため desktop だけで実行する',
  );
});

test.afterEach(async () => {
  await signOutLivePair(pair);
  pair = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** 担当成立済みの生徒・コーチを作る */
async function setUpPair(prefix: string): Promise<{ f: AuthFixture; p: LivePair; scheduleId: string }> {
  const f = await createAuthFixture(prefix);
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);
  return { f, p, scheduleId };
}

const hubPath = (p: LivePair, sessionId: string) => `/students/${p.studentId}/sessions/${sessionId}`;
const sessionInfo = (page: Page) =>
  page
    .locator('section')
    .filter({ has: page.getByText('Session Info', { exact: true }) })
    .first();
const outcomeRadio = (dialog: Locator, label: RegExp) => dialog.getByRole('radio', { name: label });

const COMPLETED = /^Completed/;
const LEFT_EARLY = /^Ended early/;
const NO_SHOW = /^Student didn’t show up/;
const COACH_ABSENT = /^I missed this session/;
const TECHNICAL = /^Couldn’t hold the lesson/;

/** ハブを開いて End Session のダイアログを開き、推定の読み込みが終わるまで待つ */
async function openEndSession(page: Page, p: LivePair, sessionId: string): Promise<Locator> {
  await page.goto(hubPath(p, sessionId));
  const dialog = page.getByRole('dialog', { name: 'End Session' });
  await clickUntilVisible(sessionInfo(page).getByRole('button', { name: 'End Session' }), dialog);
  await expect(outcomeRadio(dialog, COMPLETED)).toBeVisible();
  return dialog;
}

const recordButton = (dialog: Locator) => dialog.getByRole('button', { name: 'Record Outcome' });

async function usedSessions(f: AuthFixture, p: LivePair): Promise<number | undefined> {
  const { data } = await f.admin
    .from('com_t_user_session_ticket')
    .select('used_sessions')
    .eq('ticket_id', p.ticketId)
    .single();
  return data?.used_sessions;
}

async function coachCancelNotices(f: AuthFixture, p: LivePair): Promise<number | null> {
  const { count } = await f.admin
    .from('com_t_notification')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', p.studentId)
    .eq('notification_type', 'SESSION_CANCELLED_BY_COACH');
  return count;
}

test('通話の重なりが20分未満なら「早期終了」が初期選択になり、理由を入力して記録するとチケットを消化する', async ({
  browser,
}) => {
  const { f, p, scheduleId } = await setUpPair('sessearly');
  const day = await prepareLiveSessionDay(f, p, scheduleId, { studentMinutesInCall: 10 });
  const reason = `The student had to leave for work (${f.tag}).`;

  const { context, page } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    const dialog = await openEndSession(page, p, day.sessionId);
    await expect(dialog.getByTestId('session-outcome-evidence')).toContainText('connected together for 10 min');
    await expect(outcomeRadio(dialog, LEFT_EARLY)).toBeChecked();
    await expect(dialog.getByRole('radio', { name: 'In the app' })).toBeChecked();
    await expect(recordButton(dialog)).toBeDisabled();
    await dialog.getByRole('textbox').fill(reason);
    await recordButton(dialog).click();

    await expect(page).toHaveURL(new RegExp(`${hubPath(p, day.sessionId)}/result$`));
    await expect(page.getByText('Ended early', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(reason)).toBeVisible();

    const { data: session } = await f.admin
      .from('com_t_session')
      .select(
        'status, completion_result, status_note, conducted_via, suggested_outcome, outcome_mismatch, ticket_consumed',
      )
      .eq('session_id', day.sessionId)
      .single();
    expect(session).toMatchObject({
      status: 2,
      completion_result: 2,
      status_note: reason,
      conducted_via: 1,
      suggested_outcome: 2,
      outcome_mismatch: false,
      ticket_consumed: true,
    });
    expect(await usedSessions(f, p)).toBe(1);
  } finally {
    await context.close();
  }
});

test('生徒が一度も入室していなければ「生徒の欠席」が初期選択になり、理由なしで記録でき、チケットを消化して生徒へは通知しない', async ({
  browser,
}) => {
  const { f, p, scheduleId } = await setUpPair('sessnoshow');
  const day = await prepareLiveSessionDay(f, p, scheduleId, { studentMinutesInCall: 0 });

  const { context, page } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    const dialog = await openEndSession(page, p, day.sessionId);
    await expect(dialog.getByTestId('session-outcome-evidence')).toContainText('the student never joined');
    await expect(outcomeRadio(dialog, NO_SHOW)).toBeChecked();
    await expect(recordButton(dialog)).toBeEnabled();
    await recordButton(dialog).click();

    await expect(page).toHaveURL(new RegExp(`${hubPath(p, day.sessionId)}/result$`));
    await expect(page.getByText('No-show', { exact: true }).first()).toBeVisible();

    const { data: session } = await f.admin
      .from('com_t_session')
      .select('status, completion_result')
      .eq('session_id', day.sessionId)
      .single();
    expect(session).toMatchObject({ status: 2, completion_result: 3 });
    expect(await usedSessions(f, p)).toBe(1);
    expect(await coachCancelNotices(f, p)).toBe(0);
  } finally {
    await context.close();
  }
});

test('通話の記録が無いセッションは外部のZoomでの実施を記録でき、コーチの欠席・通信トラブル等はキャンセル（返還）として区別して記録される', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { f, p, scheduleId } = await setUpPair('sessoutcome');
  const [externalId, mismatchId, absentId, technicalId] = await createStaleSessions(f, p, scheduleId, 4);

  const { context, page } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await test.step('外部のZoom: 実施方法の初期値が外部のZoomになり、理由が必須。実施完了としてチケットを消化する', async () => {
      const reason = `The app call would not connect, so we used my Zoom (${f.tag}).`;
      const dialog = await openEndSession(page, p, externalId);
      await expect(dialog.getByTestId('session-outcome-evidence')).toContainText('You did not join the in-app call');
      await expect(outcomeRadio(dialog, COMPLETED)).toBeChecked();
      await expect(dialog.getByRole('radio', { name: /^External Zoom/ })).toBeChecked();
      await expect(dialog).toContainText('Please note why the app call couldn’t be used.');
      await expect(recordButton(dialog)).toBeDisabled();
      await dialog.getByRole('textbox').fill(reason);
      await recordButton(dialog).click();
      await expect(page).toHaveURL(new RegExp(`${hubPath(p, externalId)}/result$`));
      await expect(page.getByText('Held on an external Zoom')).toBeVisible();
      const { data } = await f.admin
        .from('com_t_session')
        .select('status, completion_result, conducted_via, status_note')
        .eq('session_id', externalId)
        .single();
      expect(data).toMatchObject({ status: 2, completion_result: 1, conducted_via: 2, status_note: reason });
      expect(await usedSessions(f, p)).toBe(1);
    });

    await test.step('推定と違う結果: 通話の記録が無いのにアプリ内で実施完了とすると理由が必須になり、推定と違う印が付く', async () => {
      const dialog = await openEndSession(page, p, mismatchId);
      await dialog.getByRole('radio', { name: 'In the app' }).check();
      await expect(dialog).toContainText('This is different from the in-app call record');
      await expect(recordButton(dialog)).toBeDisabled();
      await dialog.getByRole('textbox').fill(`My join was not recorded (${f.tag}).`);
      await recordButton(dialog).click();
      await expect(page).toHaveURL(new RegExp(`${hubPath(p, mismatchId)}/result$`));
      const { data } = await f.admin
        .from('com_t_session')
        .select('completion_result, conducted_via, outcome_mismatch')
        .eq('session_id', mismatchId)
        .single();
      expect(data).toMatchObject({ completion_result: 1, conducted_via: 1, outcome_mismatch: true });
      expect(await usedSessions(f, p)).toBe(2);
    });

    await test.step('コーチの欠席: キャンセル（返還）になり、生徒概要へ戻り、生徒へ通知する', async () => {
      const dialog = await openEndSession(page, p, absentId);
      await outcomeRadio(dialog, COACH_ABSENT).check();
      await expect(dialog.getByRole('radio', { name: 'In the app' })).toHaveCount(0);
      await expect(recordButton(dialog)).toBeDisabled();
      await dialog.getByRole('textbox').fill(`I was sick and missed the session (${f.tag}).`);
      await recordButton(dialog).click();
      await expect(page).toHaveURL(new RegExp(`/students/${p.studentId}$`));
      const { data } = await f.admin
        .from('com_t_session')
        .select('status, cancel_category, ticket_refunded')
        .eq('session_id', absentId)
        .single();
      expect(data).toMatchObject({ status: 3, cancel_category: 2, ticket_refunded: true });
      expect(await usedSessions(f, p)).toBe(2);
      expect(await coachCancelNotices(f, p)).toBe(1);
    });

    await test.step('通信トラブル等: コーチの欠席とは別の区分のキャンセル（返還）になり、生徒へは通知しない', async () => {
      const dialog = await openEndSession(page, p, technicalId);
      await outcomeRadio(dialog, TECHNICAL).check();
      await dialog.getByRole('textbox').fill(`Neither the app call nor Zoom worked (${f.tag}).`);
      await recordButton(dialog).click();
      await expect(page).toHaveURL(new RegExp(`/students/${p.studentId}$`));
      const { data } = await f.admin
        .from('com_t_session')
        .select('status, cancel_category, ticket_refunded')
        .eq('session_id', technicalId)
        .single();
      expect(data).toMatchObject({ status: 3, cancel_category: 6, ticket_refunded: true });
      expect(await usedSessions(f, p)).toBe(2);
      expect(await coachCancelNotices(f, p)).toBe(1);
    });

    await test.step('履歴: 4件ともコーチの記録として残る', async () => {
      const { data } = await f.admin
        .from('com_t_session_outcome_history')
        .select('session_id, action, outcome, ticket_action')
        .in('session_id', [externalId, mismatchId, absentId, technicalId]);
      expect(data).toHaveLength(4);
      expect(data?.every((row) => row.action === 'recorded')).toBe(true);
      expect(data?.filter((row) => row.ticket_action === 'consumed')).toHaveLength(2);
    });
  } finally {
    await context.close();
  }
});

test('開始予定より前に End Session を押すと、記録できない旨を表示してダイアログを開かない', async ({ browser }) => {
  const { f, p } = await setUpPair('sessbefore');
  const { data: upcoming } = await f.admin
    .from('com_t_session')
    .select('session_id')
    .eq('ticket_id', p.ticketId)
    .eq('status', 1)
    .gt('start_datetime', new Date().toISOString())
    .order('start_datetime')
    .limit(1)
    .single();
  if (!upcoming) throw new Error('今後のセッションが作られていません');

  const { context, page } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await page.goto(hubPath(p, upcoming.session_id));
    const notice = sessionInfo(page).getByText(/You can record the outcome once the session has started/);
    await clickUntilVisible(sessionInfo(page).getByRole('button', { name: 'End Session' }), notice);
    await expect(page.getByRole('dialog', { name: 'End Session' })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
