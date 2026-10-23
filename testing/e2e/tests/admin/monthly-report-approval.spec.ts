import { openAdminContext } from '../../support/adminApp.ts';
import {
  cleanupAuthFixture,
  createAuthFixture,
  deleteFixtureChatRooms,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { clickUntilVisible } from '../../support/hydration.ts';
import {
  approveMatchingRequest,
  createPendingMatchingRequest,
  createStaleSessions,
  signOutLivePair,
  type LivePair,
} from '../../support/liveSessionFixtures.ts';
import { expect, test } from '../../support/studentApp.ts';

/**
 * 月次コーチングレポートの承認（機能: e2e/specs/monthly-report/coach-monthly-report.md）。
 *
 * 承認の件数は承認時点のスナップショットに固定し、承認後に実施結果が変わっても承認済みの表示・請求書は変わらず、
 * 変わったことを警告で知らせる。取り消して承認し直すと今の件数になる。今月より後の月・承認済みの月は承認できない。
 * admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = 'MonthlyReport2026a';

let fixture: AuthFixture | undefined;
let pair: LivePair | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    '使い捨てデータを作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する',
  );
});

test.afterEach(async () => {
  await signOutLivePair(pair);
  pair = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** コーチ（Asia/Tokyo）の暦の年月 "YYYY-MM" */
function monthInTokyo(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(date);
}

function nextMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
}

test('承認の件数は承認時点に固定され、後の変化は警告で知らせ、取り消して承認し直すと今の件数になる', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const f = await createAuthFixture('monthlyreport');
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);
  const [sessionId] = await createStaleSessions(f, p, scheduleId, 1);
  const { data: created, error: completeError } = await f.admin
    .from('com_t_session')
    .update({ status: 2, completion_result: 1, conducted_via: 1 })
    .eq('session_id', sessionId)
    .select('start_datetime')
    .single();
  if (completeError || !created) throw new Error(`セッションを実施済みにできませんでした: ${completeError?.message}`);
  const month = monthInTokyo(new Date(created.start_datetime));

  const snapshot = async () => {
    const { data } = await f.admin
      .from('com_t_coach_monthly_report_approval')
      .select('status, session_count_snapshot')
      .eq('coach_id', p.coachId)
      .eq('report_month', `${month}-01`)
      .maybeSingle();
    return data;
  };

  const { context, page: admin } = await openAdminContext(browser);
  try {
    const counts = admin.getByTestId('monthly-report-counts');
    const changedWarning = admin.getByTestId('monthly-report-changed-warning');
    const confirmDialog = admin.getByRole('alertdialog');

    const approve = async () => {
      await clickUntilVisible(admin.getByRole('button', { name: '承認する' }), confirmDialog);
      await confirmDialog.getByRole('button', { name: '承認する' }).click();
      await expect(admin.getByRole('button', { name: '承認を取り消す' })).toBeVisible();
    };

    await test.step('今月より後の月は「承認する」が押せない', async () => {
      await admin.goto(`/monthly-reports?coachId=${p.coachId}&month=${nextMonth(month)}`);
      await expect(admin.getByText('未承認', { exact: true })).toBeVisible();
      await expect(admin.getByRole('button', { name: '承認する' })).toBeDisabled();
    });

    await test.step('承認すると、その時点の合計・内訳がスナップショットに残る。承認済みの月はもう一度承認できない', async () => {
      await admin.goto(`/monthly-reports?coachId=${p.coachId}&month=${month}`);
      await expect(counts).toContainText('総セッション数: 1');
      await approve();
      expect((await snapshot())?.session_count_snapshot).toMatchObject({
        total: 1,
        completed: 1,
        late_cancel: 0,
        no_show: 0,
      });

      const { error } = await f.admin.rpc('approve_coach_monthly_report', {
        p_coach_id: p.coachId,
        p_report_month: `${month}-01`,
        p_approved_by: null,
      });
      expect(error?.message).toContain('already approved');
    });

    await test.step('承認後に実施結果が変わっても、承認済みの件数・請求書は変わらず、警告に今の件数が出る', async () => {
      await f.admin.from('com_t_session').update({ completion_result: 3 }).eq('session_id', sessionId);
      await admin.reload();
      await expect(counts).toContainText('完了 1・12時間以内キャンセル 0・No Show 0');
      await expect(changedWarning).toContainText('完了 0・12時間以内キャンセル 0・No Show 1');

      const invoice = await admin.request.get(`/api/monthly-reports/invoice?coachId=${p.coachId}&month=${month}`);
      expect(invoice.status()).toBe(200);
      expect(invoice.headers()['content-type']).toBe('application/pdf');
      expect((await snapshot())?.session_count_snapshot).toMatchObject({ completed: 1, no_show: 0 });
    });

    await test.step('取り消して承認し直すと、今の件数で承認され、警告が消える', async () => {
      await clickUntilVisible(admin.getByRole('button', { name: '承認を取り消す' }), confirmDialog);
      await confirmDialog.getByRole('button', { name: '取り消す' }).click();
      await expect(admin.getByText('未承認', { exact: true })).toBeVisible();
      await expect.poll(async () => (await snapshot())?.session_count_snapshot ?? null).toBeNull();

      await approve();
      await expect(counts).toContainText('完了 0・12時間以内キャンセル 0・No Show 1');
      await expect(changedWarning).toHaveCount(0);
      expect((await snapshot())?.session_count_snapshot).toMatchObject({ total: 1, completed: 0, no_show: 1 });
    });
  } finally {
    await context.close();
  }
});
