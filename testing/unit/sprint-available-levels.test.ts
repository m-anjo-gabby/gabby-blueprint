import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSprintAvailableLevels } from '@gabby/lib/sprint/availableLevels';

/**
 * 教材ごとの「問題がある種別×レベル」（RPC get_sprint_available_levels の結果のまとめ方）。
 * 生徒の自主トレ・コーチの Live Sprint の設定で、問題の無いレベルを選べないようにするために使う。
 */

/** rpc だけを持つ偽の接続（呼ばれた引数を記録する） */
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return result;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test('問題のあるレベル: 教材ごと・種別ごとにレベルの一覧にまとめる', async () => {
  const { client, calls } = fakeClient({
    data: [
      { content_id: 'c1', question_type: '0', difficulty_level: 1 },
      { content_id: 'c1', question_type: '0', difficulty_level: '2' },
      { content_id: 'c1', question_type: '5', difficulty_level: 3 },
      { content_id: 'c2', question_type: '6', difficulty_level: 4 },
    ],
    error: null,
  });
  const result = await fetchSprintAvailableLevels(client, ['c1', 'c2']);
  assert.deepEqual(calls, [{ fn: 'get_sprint_available_levels', args: { p_content_ids: ['c1', 'c2'] } }]);
  assert.deepEqual(Object.fromEntries(result ?? []), {
    c1: { '0': [1, 2], '5': [3] },
    c2: { '6': [4] },
  });
});

test('問題のあるレベル: 教材が無ければ問い合わせない・失敗したら null（呼び出し側は絞り込まずに表示する）', async () => {
  const empty = fakeClient({ data: [], error: null });
  assert.deepEqual(await fetchSprintAvailableLevels(empty.client, []), new Map());
  assert.equal(empty.calls.length, 0);

  const failed = fakeClient({ data: null, error: { message: 'boom' } });
  assert.equal(await fetchSprintAvailableLevels(failed.client, ['c1']), null);
});
