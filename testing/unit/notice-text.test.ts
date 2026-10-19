import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getNoticeImageUrl, isExternalNoticeCtaUrl, isValidNoticeCtaUrl } from '@gabby/lib/notice/links';
import { toNoticePlainText } from '@gabby/lib/notice/plainText';

/**
 * お知らせの本文（Markdown）の一覧・通知用の平文と、画像・ボタンのリンク。
 * ボタンのリンクはアプリ内のパスか https の URL だけ（DB の chk_notice_cta と同じ条件）。
 */

test('平文: Markdown の記号を除き、文字だけを1行にする', () => {
  const markdown = [
    '# 重要なお知らせ',
    '',
    '**メンテナンス**を _10月20日_ に行います。',
    '- [詳しくはこちら](https://example.com)',
    '> 引用',
    '![図](https://example.com/a.png)',
    '| 項目 | 内容 |',
    '| --- | --- |',
    '| 時間 | 2時間 |',
    '```',
    'code',
    '```',
    '---',
    '1. 手順',
  ].join('\n');
  assert.equal(
    toNoticePlainText(markdown),
    '重要なお知らせ メンテナンスを _10月20日_ に行います。 詳しくはこちら 引用 項目 内容 時間 2時間 手順',
  );
  // 単語の中の _ は残す
  assert.equal(toNoticePlainText('file_name と ~~旧~~ `code`'), 'file_name と 旧 code');
});

test('ボタンのリンク: アプリ内のパスか https の URL だけを許す', () => {
  for (const ok of ['/', '/live-room', '/notice/1?x=1', 'https://example.com', 'https://example.com/a?b=c']) {
    assert.equal(isValidNoticeCtaUrl(ok), true, ok);
  }
  for (const bad of [
    '//evil.example.com',
    'http://example.com',
    'javascript:alert(1)',
    'live-room',
    'https://a b',
    '',
  ]) {
    assert.equal(isValidNoticeCtaUrl(bad), false, bad);
  }
  assert.equal(isExternalNoticeCtaUrl('https://example.com'), true);
  assert.equal(isExternalNoticeCtaUrl('/live-room'), false);
});

test('画像の URL: Storage の公開 URL を組み立てる（パス・接続先が無ければ null）', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  try {
    assert.equal(
      getNoticeImageUrl('2026/10/a.png'),
      'https://project.supabase.co/storage/v1/object/public/notices/2026/10/a.png',
    );
    assert.equal(getNoticeImageUrl(null), null);
    assert.equal(getNoticeImageUrl(''), null);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.equal(getNoticeImageUrl('a.png'), null);
  } finally {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
});
