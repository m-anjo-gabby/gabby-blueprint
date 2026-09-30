import { loadCommonShellData } from '@gabby/lib/shell/loadCommonShellData';
import type { CommonShellData } from '@gabby/lib/shell/shellDataTypes';
import type { CoachIncomingRequestItem } from '@gabby/types/coachInbox';
import { getPendingIncomingRequestsForCoach } from '@/actions/matchingRequestAction';

/** アプリシェル（ヘッダー・サイドバー・ダッシュボードの注意帯）の件数表示に使う初期データ。取得に失敗した項目は null */
export interface CoachShellData extends CommonShellData {
  requests: CoachIncomingRequestItem[] | null;
}

/**
 * シェルの初期データをサーバーでまとめて取得する（レイアウトから await せずに Promise のまま渡す）。
 * チャット未読・お知らせ・通知は全アプリ共通の loadCommonShellData、マッチング依頼はコーチ固有の取得。
 */
export async function loadCoachShellData(): Promise<CoachShellData> {
  const [common, requests] = await Promise.all([
    loadCommonShellData({ includeChat: true }),
    getPendingIncomingRequestsForCoach().catch(() => null),
  ]);
  return { ...common, requests };
}
