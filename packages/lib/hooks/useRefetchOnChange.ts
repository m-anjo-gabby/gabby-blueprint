'use client';

import { useEffect, useEffectEvent, useState } from 'react';

/**
 * サーバーで取得した初期値で表示を始め、refreshKey が表示した時の値から変わった時だけ refetch を呼ぶ。
 * 初期表示のデータを表示後にブラウザから取り直さない（docs/UI.md「初期表示に必要なデータ」）ための部品で、
 * 編集の後（ストアの lastUpdated 等）・選び直しの後の取り直しだけをブラウザから行う。
 * hasInitialData が false の場合（利用者が選んだ対象をその場で開いた等、サーバーの初期値が無い場合）は、表示した時にも呼ぶ。
 */
export function useRefetchOnChange(refreshKey: string | number, refetch: () => void, hasInitialData = true): void {
  const [initialKey] = useState<string | number | null>(() => (hasInitialData ? refreshKey : null));
  const onChange = useEffectEvent(refetch);

  useEffect(() => {
    if (refreshKey === initialKey) return;
    onChange();
  }, [refreshKey, initialKey]);
}
