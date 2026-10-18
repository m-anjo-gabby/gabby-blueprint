import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionStatusBadge, type SessionStatusBadgeLabels } from '@gabby/lib/session/sessionStatusBadge';
import { CANCEL_CATEGORY, COMPLETION_RESULT, SESSION_STATUS } from '@gabby/types/session';

/**
 * ライブセッションの状態のバッジ（3アプリ共通。文言・色は各アプリが渡す）。状態・完了の内訳・キャンセルの起因で選ぶ。
 */

const style = (label: string) => ({ label, className: '' });
const labels: SessionStatusBadgeLabels = {
  scheduled: style('scheduled'),
  completedNormal: style('completedNormal'),
  completedEarlyEnded: style('completedEarlyEnded'),
  completedNoShow: style('completedNoShow'),
  cancelledByStudent: style('cancelledByStudent'),
  cancelledByCoach: style('cancelledByCoach'),
  cancelledLicenseEnded: style('cancelledLicenseEnded'),
  cancelledCoachReassigned: style('cancelledCoachReassigned'),
  cancelledTechnical: style('cancelledTechnical'),
  cancelledOther: style('cancelledOther'),
};
const badge = (status: 1 | 2 | 3, completion: 1 | 2 | 3 | null = null, cancel: 1 | 2 | 3 | 4 | 5 | 6 | null = null) =>
  buildSessionStatusBadge({ status, completion_result: completion, cancel_category: cancel }, labels).label;

test('状態のバッジ: 予定・完了の内訳を選ぶ（内訳の無い旧い完了は通常の完了）', () => {
  assert.equal(badge(SESSION_STATUS.SCHEDULED), 'scheduled');
  assert.equal(badge(SESSION_STATUS.COMPLETED, COMPLETION_RESULT.NORMAL), 'completedNormal');
  assert.equal(badge(SESSION_STATUS.COMPLETED, COMPLETION_RESULT.EARLY_ENDED), 'completedEarlyEnded');
  assert.equal(badge(SESSION_STATUS.COMPLETED, COMPLETION_RESULT.NO_SHOW), 'completedNoShow');
  assert.equal(badge(SESSION_STATUS.COMPLETED, null), 'completedNormal');
});

test('状態のバッジ: キャンセルは起因ごとに選び、アドミンの操作・起因の無いものは「その他」', () => {
  assert.equal(badge(SESSION_STATUS.CANCELLED, null, CANCEL_CATEGORY.STUDENT), 'cancelledByStudent');
  assert.equal(badge(SESSION_STATUS.CANCELLED, null, CANCEL_CATEGORY.COACH), 'cancelledByCoach');
  assert.equal(badge(SESSION_STATUS.CANCELLED, null, CANCEL_CATEGORY.LICENSE_ENDED), 'cancelledLicenseEnded');
  assert.equal(badge(SESSION_STATUS.CANCELLED, null, CANCEL_CATEGORY.COACH_REASSIGNED), 'cancelledCoachReassigned');
  assert.equal(badge(SESSION_STATUS.CANCELLED, null, CANCEL_CATEGORY.TECHNICAL), 'cancelledTechnical');
  assert.equal(badge(SESSION_STATUS.CANCELLED, null, CANCEL_CATEGORY.ADMIN), 'cancelledOther');
  assert.equal(badge(SESSION_STATUS.CANCELLED, null, null), 'cancelledOther');
});
