import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * admin の翻訳カタログ（apps/admin/messages/{ja,en}.json）のキーが一致していること。
 * キーの型は ja.json から作る（apps/admin/i18n/messages.d.ts）ため、en.json の抜け・余りはここで止める。
 */

function loadMessages(locale: 'ja' | 'en'): unknown {
  return JSON.parse(readFileSync(new URL(`../../apps/admin/messages/${locale}.json`, import.meta.url), 'utf8'));
}

/** 末端のキーを「a.b.c」の形で集める */
function collectKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => collectKeys(child, prefix ? `${prefix}.${key}` : key));
}

test('admin の翻訳: ja.json と en.json のキーが一致する', () => {
  const ja = new Set(collectKeys(loadMessages('ja')));
  const en = new Set(collectKeys(loadMessages('en')));
  assert.deepEqual(
    [...ja].filter((key) => !en.has(key)),
    [],
    'en.json に無いキー',
  );
  assert.deepEqual(
    [...en].filter((key) => !ja.has(key)),
    [],
    'ja.json に無いキー',
  );
});
