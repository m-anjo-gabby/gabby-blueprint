import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createR2Bucket, readR2BucketConfig } from '@gabby/lib/r2/bucket';

/** R2 の接続先の読み込みと署名付き URL（R2 に接続せずに作れる部分） */

const ENV = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_ACCESS_KEY_ID: 'fedcba9876543210fedcba9876543210',
  R2_SECRET_ACCESS_KEY: 'a'.repeat(64),
  R2_VIDEO_BUCKET: 'blueprint-video-dev',
};

test('接続先: 用途のバケットの変数と共通の3つを読み、足りない変数の名前だけを並べて断る', () => {
  assert.deepEqual(readR2BucketConfig('R2_VIDEO_BUCKET', ENV), {
    accountId: ENV.R2_ACCOUNT_ID,
    accessKeyId: ENV.R2_ACCESS_KEY_ID,
    secretAccessKey: ENV.R2_SECRET_ACCESS_KEY,
    bucket: 'blueprint-video-dev',
  });
  assert.throws(
    () => readR2BucketConfig('R2_VIDEO_BUCKET', { ...ENV, R2_SECRET_ACCESS_KEY: '', R2_VIDEO_BUCKET: undefined }),
    (e: Error) =>
      e.message.endsWith('R2_SECRET_ACCESS_KEY, R2_VIDEO_BUCKET') && !e.message.includes(ENV.R2_ACCESS_KEY_ID),
  );
});

test('署名付き URL: アカウントのエンドポイントのバケット・キーを指し、有効期間を上限（7日）までに収める', async () => {
  const bucket = createR2Bucket(readR2BucketConfig('R2_VIDEO_BUCKET', ENV));
  const key = '3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f/aa11bb22-cc33-4d44-8e55-ff6677889900.mp4';

  const get = new URL(await bucket.presignGet(key, 4 * 60 * 60));
  assert.equal(get.origin, `https://${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  assert.equal(get.pathname, `/blueprint-video-dev/${key}`);
  assert.equal(get.searchParams.get('X-Amz-Expires'), '14400');
  assert.match(get.searchParams.get('X-Amz-Credential') ?? '', new RegExp(`^${ENV.R2_ACCESS_KEY_ID}/\\d{8}/auto/s3/`));
  assert.ok(get.searchParams.get('X-Amz-Signature'));
  assert.ok(!get.toString().includes(ENV.R2_SECRET_ACCESS_KEY));

  const put = new URL(await bucket.presignPut(key, 30 * 24 * 60 * 60));
  assert.equal(put.searchParams.get('X-Amz-Expires'), String(7 * 24 * 60 * 60));
  assert.notEqual(put.searchParams.get('X-Amz-Signature'), get.searchParams.get('X-Amz-Signature'));
});
