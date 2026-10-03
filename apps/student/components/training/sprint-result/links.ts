/** 結果画面を開いたら「全て再生」を自動で始める指定（スプリントの実施直後だけ付ける） */
export const SPRINT_RESULT_AUTOPLAY_PARAM = 'autoplay';

/**
 * スプリント実施直後の結果画面のURL。
 * autoplay: 実施の終了から移動する場合に付ける（同じページ内の移動で音声はアンロック済みのため、自動で全て再生できる）。
 */
export function getSprintResultHref(resultId: string, { autoplay = false }: { autoplay?: boolean } = {}): string {
  const base = `/training/sprint/result/${resultId}`;
  return autoplay ? `${base}?${SPRINT_RESULT_AUTOPLAY_PARAM}=1` : base;
}
