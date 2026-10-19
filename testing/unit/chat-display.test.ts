import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getChatRoomPath, getChatRoomUrl } from '@gabby/lib/chat/links';
import { formatMessageHeaderTime, isContinuationMessage } from '@gabby/lib/chat/messageGrouping';
import type { ChatMessage } from '@gabby/types/chat';
import { USER_TYPES } from '@gabby/types/user';

/**
 * チャットの表示（同じ人の続けての発言をまとめる・送信時刻の見出し）と、ルームへのリンク（3アプリ共通）。
 * 業務フロー: testing/e2e/specs/chat/
 */

const message = (sender: string, createdAt: string): ChatMessage => ({
  chat_id: `${sender}-${createdAt}`,
  room_id: 'room-1',
  sender_user_id: sender,
  message: 'hello',
  message_type: 'TEXT',
  created_at: createdAt,
  deleted_at: null,
  attachments: [],
});

test('続けての発言: 同じ人・同じ日・5分以内ならまとめる', () => {
  const first = message('a', '2026-10-18T03:00:00Z');
  assert.equal(isContinuationMessage(message('a', '2026-10-18T03:05:00Z'), first, 'Asia/Tokyo'), true);
  assert.equal(isContinuationMessage(message('a', '2026-10-18T03:05:01Z'), first, 'Asia/Tokyo'), false);
  assert.equal(isContinuationMessage(message('b', '2026-10-18T03:01:00Z'), first, 'Asia/Tokyo'), false);
  assert.equal(isContinuationMessage(first, undefined, 'Asia/Tokyo'), false);
});

test('続けての発言: 閲覧者のタイムゾーンで日付が変わればまとめない', () => {
  // 日本時間 23:58 と 0:01（UTC では同じ日）
  const before = message('a', '2026-10-18T14:58:00Z');
  const after = message('a', '2026-10-18T15:01:00Z');
  assert.equal(isContinuationMessage(after, before, 'Asia/Tokyo'), false);
  assert.equal(isContinuationMessage(after, before, 'UTC'), true);
});

test('送信時刻の見出し: 今日は時刻だけ、昨日は「昨日」、それより前は日付を付け、年が違えば年も付ける', () => {
  const labels = { locale: 'ja-JP', yesterdayLabel: '昨日', timeZone: 'Asia/Tokyo' };
  const now = new Date();
  assert.match(formatMessageHeaderTime(now.toISOString(), labels), /^\d{2}:\d{2}$/);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  assert.match(formatMessageHeaderTime(yesterday, labels), /^昨日 \d{2}:\d{2}$/);
  assert.equal(formatMessageHeaderTime('2020-01-02T03:04:00Z', labels), '2020/1/2 12:04');
});

test('ルームへのリンク: アプリ内はパス、メール等は宛先の利用者のアプリの URL で組み立てる', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://admin.example.com';
  process.env.NEXT_PUBLIC_COACH_URL = 'https://coach.example.com/';
  process.env.NEXT_PUBLIC_STUDENT_URL = 'https://student.example.com';
  try {
    assert.equal(getChatRoomPath('room-1'), '/chat/room-1');
    assert.equal(getChatRoomUrl(USER_TYPES.ADMIN, 'room-1'), 'https://admin.example.com/chat/room-1');
    assert.equal(getChatRoomUrl(USER_TYPES.COACH, 'room-1'), 'https://coach.example.com/chat/room-1');
    assert.equal(getChatRoomUrl(USER_TYPES.STUDENT, 'room-1'), 'https://student.example.com/chat/room-1');
    assert.equal(getChatRoomUrl(null, 'room-1'), 'https://student.example.com/chat/room-1');
    delete process.env.NEXT_PUBLIC_COACH_URL;
    assert.equal(getChatRoomUrl(USER_TYPES.COACH, 'room-1'), null);
  } finally {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_COACH_URL;
    delete process.env.NEXT_PUBLIC_STUDENT_URL;
  }
});
