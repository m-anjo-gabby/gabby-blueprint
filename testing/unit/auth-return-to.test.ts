import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLoginPath, sanitizeReturnTo } from '@gabby/lib/auth/returnTo';

/**
 * ログイン後の戻り先（`/login?next=<元のパス>`）。外部サイトへの転送（オープンリダイレクト）に使われないよう、
 * アプリ内のパスだけを通すこと。
 */

test('戻り先: アプリ内のパスはクエリ・ハッシュごと通す', () => {
  assert.equal(sanitizeReturnTo('/chat/room-1'), '/chat/room-1');
  assert.equal(sanitizeReturnTo('/calendar?month=2026-10'), '/calendar?month=2026-10');
  assert.equal(sanitizeReturnTo('/notice/1#top'), '/notice/1#top');
  // ログイン画面と前方一致するだけの別の画面は通す
  assert.equal(sanitizeReturnTo('/login-help'), '/login-help');
});

test('戻り先: 外部のサイトへ移る形は通さない', () => {
  for (const value of [
    'https://evil.example.com',
    'http://evil.example.com/chat',
    'javascript:alert(1)',
    '//evil.example.com',
    '//evil.example.com/chat',
    '/\\evil.example.com',
    'chat/room-1',
  ]) {
    assert.equal(sanitizeReturnTo(value), null, value);
  }
});

test('戻り先: 改行・タブ等の制御文字を含むものは通さない', () => {
  for (const value of ['/chat\n/evil', '/chat\r\nSet-Cookie: a=b', '/chat\t1', '/chat\u0000', '/chat\u007f']) {
    assert.equal(sanitizeReturnTo(value), null, JSON.stringify(value));
  }
});

test('戻り先: 空・長すぎる・トップ・ログイン画面自身は戻り先にしない', () => {
  assert.equal(sanitizeReturnTo(null), null);
  assert.equal(sanitizeReturnTo(undefined), null);
  assert.equal(sanitizeReturnTo(''), null);
  assert.equal(sanitizeReturnTo(`/${'a'.repeat(511)}`), `/${'a'.repeat(511)}`);
  assert.equal(sanitizeReturnTo(`/${'a'.repeat(512)}`), null);
  assert.equal(sanitizeReturnTo('/'), null);
  assert.equal(sanitizeReturnTo('/?x=1'), null);
  assert.equal(sanitizeReturnTo('/login'), null);
  assert.equal(sanitizeReturnTo('/login?next=/chat'), null);
  assert.equal(sanitizeReturnTo('/login/callback'), null);
});

test('戻り先: ログイン画面のパスをアプリごとに変えられる', () => {
  assert.equal(sanitizeReturnTo('/signin', '/signin'), null);
  assert.equal(sanitizeReturnTo('/login', '/signin'), '/login');
});

test('ログイン画面のパス: 安全な戻り先だけを next に付ける', () => {
  assert.equal(buildLoginPath('/login', '/chat/room-1?x=1'), '/login?next=%2Fchat%2Froom-1%3Fx%3D1');
  assert.equal(buildLoginPath('/login', '//evil.example.com'), '/login');
  assert.equal(buildLoginPath('/login', null), '/login');
  assert.equal(buildLoginPath('/login', '/login'), '/login');
});
