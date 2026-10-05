'use client';

import { useEffect, useState } from 'react';

/**
 * 画面を開いた時にストアのデータを取り直し、その取得が終わったかを返す。
 * ストアに前の画面で取得した値が残っていても、取り直しが終わるまでは false を返すため、
 * 呼び出し側は false の間は骨組みを出す（古い一覧 → 骨組み → 新しい一覧、や「0件」の一瞬の表示を防ぐ）。
 * 画面を開いた後の再取得（isLoading）でも false に戻る。
 *
 * @param fetch ストアの取得処理（引数 true で強制的に取り直す）。参照が変わると取り直すため、ストアの関数をそのまま渡す
 * @param isLoading ストアの取得中フラグ（他の画面が始めた取得の完了待ちにも使う）
 */
export function useFetchOnMount(fetch: (force: boolean) => Promise<void>, isLoading: boolean): boolean {
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(true).finally(() => {
      if (active) setFetched(true);
    });
    return () => {
      active = false;
    };
  }, [fetch]);

  return fetched && !isLoading;
}
