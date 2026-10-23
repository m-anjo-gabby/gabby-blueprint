import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getApprovedCounts,
  getCurrentCounts,
  hasCountsChanged,
  isFutureReportMonth,
} from '@gabby/lib/monthlyReport/reportCounts';
import { type CoachMonthlyReport, type MonthlyReportApproval } from '@gabby/types/monthlyReport';

/**
 * 月次コーチングレポートの件数。請求書・支払通知書（PDF）と承認済みの表示は承認時点のスナップショットを使い、
 * 承認後に実施結果を直しても支払額が変わらないこと。今月より後の月は承認できないこと。
 * 仕様: testing/e2e/specs/monthly-report/coach-monthly-report.md
 */

const SNAPSHOT = { total: 5, completed: 3, late_cancel: 1, no_show: 1, by_student: [] };

function approval(overrides: Partial<MonthlyReportApproval>): MonthlyReportApproval {
  return {
    status: 2,
    session_count_snapshot: SNAPSHOT,
    rate_amount: 30,
    rate_currency: 'CAD',
    approved_by: null,
    approved_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

function report(counts: { total: number; completed: number; lateCancel: number; noShow: number }): CoachMonthlyReport {
  return {
    report_month: '2026-09-01',
    students: [],
    grand_total: counts.total,
    completed_count: counts.completed,
    late_cancel_count: counts.lateCancel,
    no_show_count: counts.noShow,
    unresolved_count: 0,
    is_future_month: false,
    coach_timezone: 'Asia/Tokyo',
    approval: null,
  };
}

test('承認時点の件数: 承認済みの月はスナップショットの合計・内訳を返す', () => {
  assert.deepEqual(getApprovedCounts(approval({})), { total: 5, completed: 3, late_cancel: 1, no_show: 1 });
});

test('承認時点の件数: 未承認・取り消し済み・スナップショットが無い場合は null（PDF を出さない）', () => {
  assert.equal(getApprovedCounts(null), null);
  assert.equal(getApprovedCounts(approval({ status: 1, session_count_snapshot: null })), null);
  assert.equal(getApprovedCounts(approval({ status: 1 })), null);
  assert.equal(getApprovedCounts(approval({ session_count_snapshot: null })), null);
});

test('承認後の変化: 合計か内訳のどれかが違えば変わったとみなす', () => {
  const approved = { total: 5, completed: 3, late_cancel: 1, no_show: 1 };
  assert.equal(
    hasCountsChanged(approved, getCurrentCounts(report({ total: 5, completed: 3, lateCancel: 1, noShow: 1 }))),
    false,
  );
  // 合計が同じでも、欠席を完了に直した場合は内訳が変わる
  assert.equal(
    hasCountsChanged(approved, getCurrentCounts(report({ total: 5, completed: 4, lateCancel: 1, noShow: 0 }))),
    true,
  );
  assert.equal(
    hasCountsChanged(approved, getCurrentCounts(report({ total: 4, completed: 3, lateCancel: 0, noShow: 1 }))),
    true,
  );
});

test('承認できる月: コーチのタイムゾーンの今月より後の月だけを未来の月とする', () => {
  assert.equal(isFutureReportMonth('2026-11-01', '2026-10-31'), true);
  assert.equal(isFutureReportMonth('2027-01-01', '2026-12-15'), true);
  // 今月（月の途中）と過去の月は承認できる
  assert.equal(isFutureReportMonth('2026-10-01', '2026-10-01'), false);
  assert.equal(isFutureReportMonth('2026-09-01', '2026-10-23'), false);
});
