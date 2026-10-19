import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultConductedVia,
  getOutcomeReasonKind,
  isOutcomeMismatch,
  toSessionOutcome,
} from '@gabby/lib/session/outcome';
import { groupRescheduleProposals } from '@gabby/lib/session/rescheduleProposalUtils';
import {
  CANCEL_CATEGORY,
  CONDUCTED_VIA,
  PROPOSED_BY_ROLE,
  RESCHEDULE_PROPOSAL_STATUS,
  SESSION_OUTCOME,
  SESSION_STATUS,
  type SessionRescheduleProposal,
} from '@gabby/types/session';

/**
 * ライブセッションの実施結果（コーチの End Session・アドミンの結果の修正）の画面側の規則と、振替の候補のまとめ方。
 * 最終的な判定は RPC（record_session_outcome / admin_correct_session_outcome）が同じ規則で行う。
 * 業務フロー: testing/e2e/specs/session-lifecycle/
 */

test('実施結果: DB の記録（状態・完了の内訳・キャンセルの起因）から結果に戻す', () => {
  const row = (status: 1 | 2 | 3, completion: 1 | 2 | 3 | null, cancel: 1 | 2 | 3 | 4 | 5 | 6 | null) => ({
    status,
    completion_result: completion,
    cancel_category: cancel,
  });
  assert.equal(toSessionOutcome(row(SESSION_STATUS.COMPLETED, 2, null)), SESSION_OUTCOME.STUDENT_LEFT_EARLY);
  // 内訳の無い旧い完了の記録は「実施済み」
  assert.equal(toSessionOutcome(row(SESSION_STATUS.COMPLETED, null, null)), SESSION_OUTCOME.COMPLETED);
  assert.equal(
    toSessionOutcome(row(SESSION_STATUS.CANCELLED, null, CANCEL_CATEGORY.COACH)),
    SESSION_OUTCOME.COACH_ABSENT,
  );
  assert.equal(
    toSessionOutcome(row(SESSION_STATUS.CANCELLED, null, CANCEL_CATEGORY.TECHNICAL)),
    SESSION_OUTCOME.TECHNICAL_ISSUE,
  );
  // 生徒・アドミンのキャンセル、予定のままの行は実施結果ではない
  assert.equal(toSessionOutcome(row(SESSION_STATUS.CANCELLED, null, CANCEL_CATEGORY.STUDENT)), null);
  assert.equal(toSessionOutcome(row(SESSION_STATUS.SCHEDULED, null, null)), null);
});

test('実施結果: 理由が必須になる場合（未実施・生徒の早退・外部の Zoom・推定と違う結果）', () => {
  const { APP, EXTERNAL_ZOOM } = CONDUCTED_VIA;
  assert.equal(getOutcomeReasonKind(SESSION_OUTCOME.COACH_ABSENT, null, null), 'not_conducted');
  assert.equal(getOutcomeReasonKind(SESSION_OUTCOME.TECHNICAL_ISSUE, APP, 1), 'not_conducted');
  assert.equal(getOutcomeReasonKind(SESSION_OUTCOME.STUDENT_LEFT_EARLY, APP, 2), 'left_early');
  assert.equal(getOutcomeReasonKind(SESSION_OUTCOME.COMPLETED, EXTERNAL_ZOOM, null), 'external');
  assert.equal(getOutcomeReasonKind(SESSION_OUTCOME.COMPLETED, APP, 3), 'mismatch');
  // アプリ内で実施し、入退室の記録からの推定と同じなら理由は要らない
  assert.equal(getOutcomeReasonKind(SESSION_OUTCOME.COMPLETED, APP, 1), null);
  assert.equal(getOutcomeReasonKind(SESSION_OUTCOME.STUDENT_NO_SHOW, APP, 3), null);
});

test('実施結果: 推定と違うかは、アプリ内で実施した結果だけで判定する（コーチの入室記録が無ければ違うとみなす）', () => {
  assert.equal(isOutcomeMismatch(SESSION_OUTCOME.COMPLETED, CONDUCTED_VIA.APP, null), true);
  assert.equal(isOutcomeMismatch(SESSION_OUTCOME.COMPLETED, CONDUCTED_VIA.EXTERNAL_ZOOM, null), false);
  assert.equal(isOutcomeMismatch(SESSION_OUTCOME.COACH_ABSENT, CONDUCTED_VIA.APP, null), false);
  assert.equal(defaultConductedVia(true), CONDUCTED_VIA.APP);
  assert.equal(defaultConductedVia(false), CONDUCTED_VIA.EXTERNAL_ZOOM);
});

test('振替の候補: 同じセッション（同じキャンセル）ごとにまとめ、最も早い登録日時を残す', () => {
  const proposal = (id: string, sessionId: string, insertDate: string): SessionRescheduleProposal => ({
    proposal_id: id,
    session_id: sessionId,
    coach_id: 'coach-1',
    student_id: 'student-1',
    proposed_start_datetime: '2026-10-20T10:00:00Z',
    proposed_end_datetime: '2026-10-20T10:25:00Z',
    status: RESCHEDULE_PROPOSAL_STATUS.PENDING,
    proposed_by_role: PROPOSED_BY_ROLE.COACH,
    expires_at: '2026-10-19T10:00:00Z',
    insert_date: insertDate,
  });
  const groups = groupRescheduleProposals([
    proposal('p1', 's1', '2026-10-18T03:00:00Z'),
    proposal('p2', 's2', '2026-10-18T04:00:00Z'),
    proposal('p3', 's1', '2026-10-18T01:00:00Z'),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.session_id, g.insert_date, g.candidates.map((c) => c.proposal_id)]),
    [
      ['s1', '2026-10-18T01:00:00Z', ['p1', 'p3']],
      ['s2', '2026-10-18T04:00:00Z', ['p2']],
    ],
  );
  assert.deepEqual(groupRescheduleProposals([]), []);
});
