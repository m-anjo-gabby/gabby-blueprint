import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRatingValue, roundRatingToHalf } from '@gabby/lib/coachRating/format';
import { formatDateEn, formatDateTimeEn, formatMonthYearEn } from '@gabby/lib/date/dateEn';
import { formatLegalName } from '@gabby/lib/userLegal/formatLegalName';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getPasswordStrengthErrorCode, validatePasswordStrength } from '@gabby/lib/auth/validation';

/** 表示用の文字の組み立て（コーチの評価・英語の日付・本人の氏名）と、パスワードの強さ・エラーのメッセージの取り出し */

// ICU の版により、時刻の「PM」の前が特殊な空白（U+202F）になるため、ふつうの空白にそろえて比べる
const plainSpaces = (s: string) => s.replace(/[  ]/g, ' ');

test('コーチの評価: 星は 0.5 刻みに丸め、数値は小数1桁で出す', () => {
  assert.equal(roundRatingToHalf(4.24), 4);
  assert.equal(roundRatingToHalf(4.25), 4.5);
  assert.equal(roundRatingToHalf(4.74), 4.5);
  assert.equal(roundRatingToHalf(4.75), 5);
  assert.equal(formatRatingValue(4), '4.0');
  assert.equal(formatRatingValue(4.333), '4.3');
});

test('英語の日付: 指定のタイムゾーンで日付を決め、空・不正な値は空文字', () => {
  const iso = '2026-10-18T20:00:00Z';
  assert.equal(formatDateEn(iso, 'Asia/Tokyo'), 'Oct 19, 2026');
  assert.equal(formatDateEn(iso, 'America/Vancouver'), 'Oct 18, 2026');
  assert.equal(plainSpaces(formatDateTimeEn(iso, 'Asia/Tokyo')), 'Oct 19, 2026, 5:00 AM');
  assert.equal(formatMonthYearEn('2026-10-31T20:00:00Z', 'Asia/Tokyo'), 'November 2026');
  assert.equal(formatDateEn(null), '');
  assert.equal(formatDateEn(''), '');
  assert.equal(formatDateEn('not a date'), '');
});

test('本人の氏名: 日本語は「姓 名」、英語は名・姓の順（ローマ字表記があればそちら）', () => {
  const name = { last_name: '山田', first_name: '太郎', last_name_latin: 'Yamada', first_name_latin: 'Taro' };
  assert.equal(formatLegalName(name, 'ja'), '山田 太郎');
  assert.equal(formatLegalName(name, 'en'), 'Taro Yamada');
  const noLatin = { ...name, last_name_latin: null, first_name_latin: null };
  assert.equal(formatLegalName(noLatin, 'en'), '太郎 山田');
  // 姓の無い名前・空白だけの値は飛ばす
  assert.equal(formatLegalName({ ...noLatin, last_name: null }, 'ja'), '太郎');
  assert.equal(formatLegalName({ ...noLatin, last_name: '  ' }, 'ja'), '太郎');
  assert.equal(formatLegalName(null, 'ja'), null);
});

test('パスワードの強さ: 8文字以上で、英字と数字を両方含む', () => {
  assert.equal(getPasswordStrengthErrorCode('abc12345'), null);
  assert.equal(getPasswordStrengthErrorCode('abc1234'), 'password_too_short');
  assert.equal(getPasswordStrengthErrorCode(''), 'password_too_short');
  assert.equal(getPasswordStrengthErrorCode('abcdefgh'), 'password_needs_alnum');
  assert.equal(getPasswordStrengthErrorCode('12345678'), 'password_needs_alnum');
  assert.equal(validatePasswordStrength('abc12345'), null);
  assert.equal(validatePasswordStrength('abc'), 'パスワードは8文字以上で入力してください。');
});

test('エラーのメッセージ: Error・message を持つ値から取り出し、無ければ既定の文言', () => {
  assert.equal(getErrorMessage(new Error('boom')), 'boom');
  assert.equal(getErrorMessage({ message: 'from supabase', code: '23505' }), 'from supabase');
  assert.equal(getErrorMessage({ message: 42 }), 'Unknown error');
  assert.equal(getErrorMessage('text'), 'Unknown error');
  assert.equal(getErrorMessage(null, 'fallback'), 'fallback');
});
