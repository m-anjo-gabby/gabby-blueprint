import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getChatMessagePreviewText } from '@gabby/lib/chat/formatChatPreview';
import { formatFileSize } from '@gabby/lib/chat/formatFileSize';
import {
  filterChatRoomsByClient,
  getChatRoomClientOptions,
  getChatRoomTitle,
  matchesChatRoomQuery,
} from '@gabby/lib/chat/roomDisplay';
import type { ChatMessage, ChatRoomListItem, ChatRoomMemberSummary } from '@gabby/types/chat';

/** チャットのルーム一覧（ルーム名・最新の発言のプレビュー・顧客での絞り込み・検索）と、添付ファイルの大きさの表示 */

const member = (id: string, name: string | null, clientId: string | null = null, clientName: string | null = null) =>
  ({
    user_id: id,
    user_name: name,
    user_type: '1',
    icon_path: null,
    client_id: clientId,
    client_name: clientName,
  }) satisfies ChatRoomMemberSummary;

const message = (overrides: Partial<ChatMessage>): ChatMessage => ({
  chat_id: 'm1',
  room_id: 'r1',
  sender_user_id: 'u1',
  message: 'こんにちは',
  message_type: 'TEXT',
  created_at: '2026-10-18T00:00:00Z',
  deleted_at: null,
  attachments: [],
  ...overrides,
});

const room = (overrides: Partial<ChatRoomListItem>): ChatRoomListItem => ({
  room_id: 'r1',
  room_type: '1ON1',
  room_name: null,
  created_at: '2026-10-01T00:00:00Z',
  closed_at: null,
  last_message: null,
  unread_count: 0,
  members: [],
  is_member: true,
  ...overrides,
});

const previewLabels = {
  deleted: '削除されました',
  photo: '写真',
  file: 'ファイル',
  noMessages: 'メッセージはありません',
};
const titleLabels = { unnamedUser: '名前なし', unnamedGroup: '名前なしのグループ' };

test('最新の発言のプレビュー: 削除・添付（写真かファイル）・空を区別する', () => {
  assert.equal(getChatMessagePreviewText(null, previewLabels), 'メッセージはありません');
  assert.equal(
    getChatMessagePreviewText(message({ deleted_at: '2026-10-18T01:00:00Z' }), previewLabels),
    '削除されました',
  );
  const attachment = { attachment_id: 'a1' } as ChatMessage['attachments'][number];
  assert.equal(
    getChatMessagePreviewText(
      message({ message_type: 'IMAGE', message: '', attachments: [attachment] }),
      previewLabels,
    ),
    '写真',
  );
  assert.equal(
    getChatMessagePreviewText(
      message({ message_type: 'FILE', message: '資料です', attachments: [attachment] }),
      previewLabels,
    ),
    'ファイル · 資料です',
  );
  assert.equal(getChatMessagePreviewText(message({ message: 'やあ' }), previewLabels), 'やあ');
});

test('ルーム名: 1対1は相手の名前、グループはルーム名、参加していないルーム（アドミンの査閲）は全員の名前', () => {
  const members = [member('me', '自分'), member('other', null)];
  assert.equal(getChatRoomTitle(room({ members }), 'me', titleLabels), '名前なし');
  assert.equal(
    getChatRoomTitle(room({ members: [member('me', '自分'), member('o', '相手')] }), 'me', titleLabels),
    '相手',
  );
  assert.equal(getChatRoomTitle(room({ room_type: 'GROUP', room_name: '連絡' }), 'me', titleLabels), '連絡');
  assert.equal(getChatRoomTitle(room({ room_type: 'GROUP' }), 'me', titleLabels), '名前なしのグループ');
  assert.equal(
    getChatRoomTitle(
      room({ is_member: false, members: [member('a', '生徒A'), member('b', null)] }),
      'admin',
      titleLabels,
    ),
    '生徒A ⇔ 名前なし',
  );
});

test('顧客での絞り込み: 選択肢は参加者の顧客を名前順に1件ずつ、絞り込みはその顧客の参加者がいるルーム', () => {
  const rooms = [
    room({ room_id: 'r1', members: [member('a', 'A', 'c2', '顧客B'), member('x', 'X')] }),
    room({ room_id: 'r2', members: [member('b', 'B', 'c1', '顧客A'), member('c', 'C', 'c2', '顧客B')] }),
    room({ room_id: 'r3', members: [member('d', 'D', 'c3', null)] }),
  ];
  assert.deepEqual(getChatRoomClientOptions(rooms, '名前なしの顧客', 'ja'), [
    { value: 'c1', label: '顧客A' },
    { value: 'c2', label: '顧客B' },
    { value: 'c3', label: '名前なしの顧客' },
  ]);
  assert.deepEqual(
    filterChatRoomsByClient(rooms, 'c2').map((r) => r.room_id),
    ['r1', 'r2'],
  );
  assert.equal(filterChatRoomsByClient(rooms, '').length, 3);
});

test('ルームの検索: ルーム名・参加者の名前・最新の発言を大文字小文字を区別せずに探す', () => {
  const target = room({ members: [member('a', 'Alice')], last_message: message({ message: 'See you Monday' }) });
  assert.equal(matchesChatRoomQuery(target, 'Room', 'alice'), true);
  assert.equal(matchesChatRoomQuery(target, 'Room', 'monday'), true);
  assert.equal(matchesChatRoomQuery(target, 'Room', 'room'), true);
  assert.equal(matchesChatRoomQuery(target, 'Room', 'bob'), false);
  assert.equal(matchesChatRoomQuery(target, 'Room', '  '), true);
});

test('ファイルの大きさ: 単位を上げ、10未満は小数1桁で出す', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(1536), '1.5 KB');
  assert.equal(formatFileSize(20 * 1024), '20 KB');
  assert.equal(formatFileSize(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatFileSize(3 * 1024 * 1024 * 1024), '3.0 GB');
  assert.equal(formatFileSize(5000 * 1024 * 1024 * 1024), '5000 GB');
});
