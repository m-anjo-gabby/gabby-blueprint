'use client';

import { useLayoutEffect } from 'react';
import { applyCommonShellData, setCommonShellStoresLoading } from '@gabby/lib/shell/commonShellStores';
import { useShellDataPromise, useShellNavContext } from './ShellNavContext';

/**
 * サーバーで取得したシェルの初期データ（チャット未読・お知らせ・通知）を各ストアに流し込む（AppShell の中に置く）。
 * (app)/layout.tsx から Promise のまま受け取るため、画面の表示は待たせず、データは HTML/RSC の続きとして届く。
 * ヘッダー・ナビ・画面の各部品の表示時の取得（useEffect）より先に、useLayoutEffect で各ストアを「取得中」にして、
 * 同じ取得をブラウザから重ねて呼ばせない。取得できなかった項目だけブラウザから取り直す。
 * チャットはライブセッション付き契約のある生徒だけが使うため、その場合だけ扱う。
 */
export function ShellDataLoader() {
  const data = useShellDataPromise();
  const { hasLiveSession } = useShellNavContext();

  useLayoutEffect(() => {
    if (!data) return;
    const options = { includeChat: hasLiveSession };
    let active = true;
    setCommonShellStoresLoading(true, options);

    const settle = (d: Parameters<typeof applyCommonShellData>[0]) => {
      if (!active) return;
      active = false;
      setCommonShellStoresLoading(false, options);
      applyCommonShellData(d, options);
    };
    data.then(settle, () => settle(null));

    return () => {
      // 反映前に外れた場合も「取得中」のまま残さない（再実行時はもう一度取得中にしてから待つ）
      if (active) setCommonShellStoresLoading(false, options);
      active = false;
    };
  }, [data, hasLiveSession]);

  return null;
}
