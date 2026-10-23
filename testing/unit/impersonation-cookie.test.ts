import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeImpersonationCookie, resolveImpersonation } from '@gabby/lib/impersonation';

/**
 * 代理ログインの Cookie（imp_session）。期限は無く、ログイン中の本人への代理ログインの Cookie だけを
 * ログの印に使うこと（ログアウト後に別のユーザーでログインした操作に印を付けない）。
 * 仕様: testing/e2e/specs/admin/impersonation.md
 */

const TARGET = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const OTHER = '9f8e7d6c-5b4a-4321-8fed-cba987654321';
const PAYLOAD = { id: 'imp-1', adminId: 'admin-1', targetUserId: TARGET };

test('代理ログインの Cookie: ログイン中の本人への Cookie なら内容を返す', () => {
  assert.deepEqual(resolveImpersonation(encodeImpersonationCookie(PAYLOAD), TARGET), PAYLOAD);
});

test('代理ログインの Cookie: 本人と違う・未ログイン・Cookie が無い場合は使わない', () => {
  assert.equal(resolveImpersonation(encodeImpersonationCookie(PAYLOAD), OTHER), null);
  assert.equal(resolveImpersonation(encodeImpersonationCookie(PAYLOAD), undefined), null);
  assert.equal(resolveImpersonation(undefined, TARGET), null);
});

test('代理ログインの Cookie: 形の違う値（対象の無い以前の形・壊れた値）は使わない', () => {
  const legacy = Buffer.from(JSON.stringify({ id: 'imp-1', adminId: 'admin-1', expiresAt: 0 }), 'utf-8').toString(
    'base64url',
  );
  assert.equal(resolveImpersonation(legacy, TARGET), null);
  assert.equal(resolveImpersonation('not-base64-json', TARGET), null);
});
