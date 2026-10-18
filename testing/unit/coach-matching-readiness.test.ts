import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCoachMatchingMissingItems, isCoachMatchable } from '@gabby/lib/coachProfile/matchingReadiness';
import type { CoachProfileFormValues } from '@gabby/types/coachProfile';

/**
 * コーチを生徒の「専属コーチを探す」に出すための必須項目（画面で入力中の値からすぐに表示する側の判定）。
 * 一覧に出すかの正本は DB の fn_coach_matching_missing_items() で、項目を変える場合は両方を直す。
 * 業務フロー: testing/e2e/specs/matching/coach-matching.md
 */

const complete: CoachProfileFormValues = {
  country_code: 'CA',
  education: 'B.A. in Linguistics',
  qualifications: 'TESOL',
  teaching_years: 0,
  job_experience: 'Corporate training',
  introduction: 'Hello!',
};

test('必須項目: すべて埋まっていれば足りない項目は無い（指導年数の 0 は入力済み）', () => {
  assert.deepEqual(getCoachMatchingMissingItems({ iconPath: 'a.png', profile: complete, hasAvailability: true }), []);
});

test('必須項目: 足りない項目を決まった順で返す（空白だけの入力は未入力）', () => {
  const missing = getCoachMatchingMissingItems({
    iconPath: null,
    profile: { ...complete, country_code: null, teaching_years: null, education: '   ', introduction: null },
    hasAvailability: false,
  });
  assert.deepEqual(missing, ['icon', 'country', 'teaching_years', 'education', 'introduction', 'availability']);
  assert.deepEqual(
    getCoachMatchingMissingItems({
      iconPath: ' ',
      profile: { ...complete, qualifications: '' },
      hasAvailability: true,
    }),
    ['icon', 'qualifications'],
  );
});

test('一覧に出るか: 受付中・休止でない・必須項目がそろっている時だけ', () => {
  assert.equal(isCoachMatchable({ missingItems: [], acceptingStudents: true, isSuspended: false }), true);
  assert.equal(isCoachMatchable({ missingItems: [], acceptingStudents: false, isSuspended: false }), false);
  assert.equal(isCoachMatchable({ missingItems: [], acceptingStudents: true, isSuspended: true }), false);
  assert.equal(isCoachMatchable({ missingItems: ['icon'], acceptingStudents: true, isSuspended: false }), false);
});
