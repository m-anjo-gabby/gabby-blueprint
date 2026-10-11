'use client';

import { useLayoutEffect } from 'react';
import { applyCommonShellData, setCommonShellStoresLoading } from '@gabby/lib/shell/commonShellStores';
import type { CommonShellData } from '@gabby/lib/shell/shellDataTypes';
import { ADMIN_SHELL_DATA_OPTIONS } from '@/lib/shellData';

/**
 * サーバーで取得したシェルの初期データ（チャット未読・通知）を各ストアに流し込む。
 * レイアウトから Promise のまま受け取るため、画面の表示は待たせず、データは HTML/RSC の続きとして届く。
 * ヘッダーの通知・サイドバーのチャット未読の表示時の取得（useEffect）より先に、useLayoutEffect で各ストアを
 * 「取得中」にして、同じ取得をブラウザから重ねて呼ばせない。取得できなかった項目だけブラウザから取り直す。
 */
export function ShellDataLoader({ data }: { data: Promise<CommonShellData> }) {
  useLayoutEffect(() => {
    let active = true;
    setCommonShellStoresLoading(true, ADMIN_SHELL_DATA_OPTIONS);

    const settle = (d: CommonShellData | null) => {
      if (!active) return;
      active = false;
      setCommonShellStoresLoading(false, ADMIN_SHELL_DATA_OPTIONS);
      applyCommonShellData(d, ADMIN_SHELL_DATA_OPTIONS);
    };
    data.then(settle, () => settle(null));

    return () => {
      // 反映前に外れた場合も「取得中」のまま残さない（再実行時はもう一度取得中にしてから待つ）
      if (active) setCommonShellStoresLoading(false, ADMIN_SHELL_DATA_OPTIONS);
      active = false;
    };
  }, [data]);

  return null;
}
