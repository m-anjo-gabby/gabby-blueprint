import 'server-only';
import { cache } from 'react';
import { getMyLiveSessionContracts } from '@/actions/matchingAction';

/**
 * ログイン中の生徒のライブセッション契約（過去の契約を含む）。1リクエスト内で1回だけ取得する。
 * (app)/layout.tsx（ナビ項目・ライブ画面の骨組みの出し分け）と live-room/page.tsx（契約の選択）で共有する。
 */
export const getMyLiveSessionContractsCached = cache(getMyLiveSessionContracts);
