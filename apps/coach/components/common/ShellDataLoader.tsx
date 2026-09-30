'use client';

import { useLayoutEffect } from 'react';
import { applyCommonShellData, setCommonShellStoresLoading } from '@gabby/lib/shell/commonShellStores';
import { useRequestsStore } from '@/stores/useRequestsStore';
import type { CoachShellData } from '@/lib/shellData';

const OPTIONS = { includeChat: true } as const;

/**
 * サーバーで取得したシェルの初期データ（未読・件数）を各ストアに流し込む。
 * レイアウトから Promise のまま受け取るため、画面の表示は待たせず、データは HTML/RSC の続きとして届く。
 * ヘッダー・サイドバー・画面の各部品の表示時の取得（useEffect）より先に、useLayoutEffect で各ストアを
 * 「取得中」にして、同じ取得をブラウザから重ねて呼ばせない。取得できなかった項目だけブラウザから取り直す。
 */
export function ShellDataLoader({ data }: { data: Promise<CoachShellData> }) {
  useLayoutEffect(() => {
    let active = true;
    setCommonShellStoresLoading(true, OPTIONS);
    useRequestsStore.setState({ isLoading: true });

    const settle = (d: CoachShellData | null) => {
      if (!active) return;
      active = false;
      setCommonShellStoresLoading(false, OPTIONS);
      useRequestsStore.setState({ isLoading: false });
      applyCommonShellData(d, OPTIONS);
      if (d?.requests) useRequestsStore.getState().applyRequests(d.requests);
      else void useRequestsStore.getState().fetchRequests(true);
    };
    data.then(settle, () => settle(null));

    return () => {
      // 反映前に外れた場合も「取得中」のまま残さない（再実行時はもう一度取得中にしてから待つ）
      if (active) {
        setCommonShellStoresLoading(false, OPTIONS);
        useRequestsStore.setState({ isLoading: false });
      }
      active = false;
    };
  }, [data]);

  return null;
}
