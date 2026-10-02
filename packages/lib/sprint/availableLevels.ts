import type { SupabaseClient } from '@supabase/supabase-js';
import type { SprintAvailableLevels, SprintQuestionType } from '@gabby/types/sprint';

/**
 * 教材ごとの「問題が存在する種別×レベル」を取得する（RPC get_sprint_available_levels）。
 * 生徒の自主トレの選択画面・コーチのLive Sprint設定画面で、問題の無い種別・レベルを選べないようにするために使う。
 * 取得に失敗した場合は null を返す（呼び出し側は絞り込まずに表示し、開始時の0件判定に任せる）。
 */
export async function fetchSprintAvailableLevels(
  supabase: SupabaseClient,
  contentIds: string[]
): Promise<Map<string, SprintAvailableLevels> | null> {
  const result = new Map<string, SprintAvailableLevels>();
  if (contentIds.length === 0) return result;

  const { data, error } = await supabase.rpc('get_sprint_available_levels', { p_content_ids: contentIds });
  if (error) return null;

  for (const row of (data ?? []) as { content_id: string; question_type: SprintQuestionType; difficulty_level: number }[]) {
    const levels = result.get(row.content_id) ?? {};
    (levels[row.question_type] ??= []).push(Number(row.difficulty_level));
    result.set(row.content_id, levels);
  }
  return result;
}
