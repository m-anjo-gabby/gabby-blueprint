import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesCoachSpecialtyFilter, toCoachSpecialtyTags } from '@gabby/lib/coachSpecialty/tags';
import { buildGoogleCalendarUrl, buildIcsContent } from '@gabby/lib/calendarEvent/addToCalendar';
import { resolveCoachContentName } from '@gabby/lib/content/utils';
import type { CoachSpecialtyMaster } from '@gabby/types/coachSpecialty';

/**
 * コーチの専門（生徒のコーチ検索の絞り込み）、カレンダーへの追加（Google カレンダー・ics）、コーチ向けの教材名。
 * 業務フロー: testing/e2e/specs/matching/coach-matching.md（専門の絞り込み）
 */

const master: CoachSpecialtyMaster[] = [
  { specialty_code: 'business', kind: 'field', name_en: 'Business', name_ja: 'ビジネス', sort_no: 1 },
  { specialty_code: 'medical', kind: 'field', name_en: 'Medical', name_ja: '医療', sort_no: 2 },
  { specialty_code: 'pronunciation', kind: 'skill', name_en: 'Pronunciation', name_ja: '発音', sort_no: 3 },
  { specialty_code: 'grammar', kind: 'skill', name_en: 'Grammar', name_ja: '文法', sort_no: 4 },
];

test('専門の表示: マスタの並びで、ポータルの言語の名前にする', () => {
  assert.deepEqual(toCoachSpecialtyTags(['grammar', 'business'], master, 'ja'), [
    { code: 'business', kind: 'field', label: 'ビジネス' },
    { code: 'grammar', kind: 'skill', label: '文法' },
  ]);
  assert.deepEqual(
    toCoachSpecialtyTags(['medical', 'unknown'], master, 'en').map((t) => t.label),
    ['Medical'],
  );
});

test('専門の絞り込み: 分野は「どれか」、得意分野は「すべて」を持つコーチ', () => {
  const coach = ['business', 'pronunciation'];
  const match = (...codes: string[]) => matchesCoachSpecialtyFilter(coach, new Set(codes), master);
  assert.equal(match(), true);
  assert.equal(match('business', 'medical'), true);
  assert.equal(match('medical'), false);
  assert.equal(match('pronunciation'), true);
  assert.equal(match('pronunciation', 'grammar'), false);
  assert.equal(match('medical', 'pronunciation'), false);
  assert.equal(match('business', 'pronunciation'), true);
});

const event = {
  calendar_event_id: 'e1',
  title: 'Speaking Club; Q&A, Vol.1',
  description: '持ち物\nノート',
  start_datetime: '2026-10-20T10:00:00Z',
  end_datetime: null,
};

test('Google カレンダー: 終了時刻が無ければ1時間、説明に参加の URL を足す', () => {
  const url = new URL(buildGoogleCalendarUrl(event, { locationUrl: 'https://zoom.example.com/j/1' }));
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('dates'), '20261020T100000Z/20261020T110000Z');
  assert.equal(url.searchParams.get('details'), '持ち物\nノート\n\nhttps://zoom.example.com/j/1');
  assert.equal(url.searchParams.get('location'), 'https://zoom.example.com/j/1');
  assert.equal(new URL(buildGoogleCalendarUrl({ ...event, description: null })).searchParams.has('location'), false);
});

test('ics: 区切りの文字（; , 改行）を逃がし、行は CRLF でつなぐ', () => {
  const ics = buildIcsContent({ ...event, end_datetime: '2026-10-20T10:30:00Z' }, { locationUrl: null });
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.includes('UID:e1@gabbyacademy.com'));
  assert.ok(lines.includes('DTSTART:20261020T100000Z'));
  assert.ok(lines.includes('DTEND:20261020T103000Z'));
  assert.ok(lines.includes('SUMMARY:Speaking Club\\; Q&A\\, Vol.1'));
  assert.ok(lines.includes('DESCRIPTION:持ち物\\nノート'));
  assert.equal(
    lines.some((l) => l.startsWith('LOCATION:')),
    false,
  );
  assert.equal(lines.at(-1), 'END:VCALENDAR');
});

test('コーチ向けの教材名: 英語名があればそれ、無ければ（空白だけでも）日本語名', () => {
  assert.equal(resolveCoachContentName({ content_name: '単語帳 1', content_name_en: 'Vocabulary 1' }), 'Vocabulary 1');
  assert.equal(resolveCoachContentName({ content_name: '単語帳 1', content_name_en: '  ' }), '単語帳 1');
  assert.equal(resolveCoachContentName({ content_name: '単語帳 1', content_name_en: null }), '単語帳 1');
});
