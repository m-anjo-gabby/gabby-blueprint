import 'server-only';
import { cache } from 'react';
import { getMyLiveSessionContracts, getMySlotStatus } from '@/actions/matchingAction';
import type { LiveSessionContractSummary, NextContractMatching } from '@gabby/types/matching';

/**
 * ログイン中の生徒のライブセッション契約（過去の契約を含む）。1リクエスト内で1回だけ取得する。
 * (app)/layout.tsx（ナビ項目・ライブ画面の骨組みの出し分け）と live-room/page.tsx（契約の選択）で共有する。
 */
export const getMyLiveSessionContractsCached = cache(getMyLiveSessionContracts);

/**
 * 表示する契約を選ぶ。URL（?contract=）で指定された契約を優先し、無ければ現在有効な契約、
 * それも無ければ先頭（契約一覧は start_date 降順）を選ぶ。
 */
export function pickLiveSessionContract<T extends { ticket_id: string; is_current: boolean }>(
  contracts: T[],
  requestedTicketId?: string
): T | undefined {
  return contracts.find((c) => c.ticket_id === requestedTicketId) ?? contracts.find((c) => c.is_current) ?? contracts[0];
}

/**
 * 次の契約（継続用。有効かつ開始前のうち最も早いもの）。契約一覧は start_date 降順のため末尾が最も早い。
 */
export function pickNextLiveSessionContract(contracts: LiveSessionContractSummary[]): LiveSessionContractSummary | undefined {
  const upcoming = contracts.filter((c) => c.is_active && !c.is_current);
  return upcoming[upcoming.length - 1];
}

/**
 * 現在の契約と並ぶ次の契約の、専属コーチの選択状況を取得する。次の契約が無ければ null。
 * 案内は現在の契約の選択を優先するため、出し分けは呼び出し側で行う（現在の契約に未選択のコマが無い時だけ出す）。
 */
export async function getNextContractMatching(contracts: LiveSessionContractSummary[]): Promise<NextContractMatching | null> {
  const next = pickNextLiveSessionContract(contracts);
  if (!next) return null;
  const slots = await getMySlotStatus(next.ticket_id);
  return {
    contract: next,
    slotCount: slots.length,
    unmatchedCount: slots.filter((s) => s.status === 'unmatched').length,
    pendingCount: slots.filter((s) => s.status === 'pending').length,
  };
}
