'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * サーバーから受け取ったデータ（Server Component の props）を、画面内で書き換えられる状態として持つ。
 * 画面内の即時反映（☆の切り替え・削除など）は返り値の setter で行い、router.refresh() 等でサーバーから
 * 新しいデータが届いたら（props の参照が変わったら）その値に置き換える。
 *
 * 画面をまたぐクライアントキャッシュ（zustand 等）の代わりに使う。各画面は開くたびにサーバーで取得するため、
 * 他の画面での変更をキャッシュに反映させる制御は要らない。
 */
export function useServerSyncedState<T>(serverValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(serverValue);
  const [syncedValue, setSyncedValue] = useState(serverValue);

  // props の変化に合わせて状態を調整する（React 推奨の「レンダー中の state 調整」パターン）
  if (syncedValue !== serverValue) {
    setSyncedValue(serverValue);
    setState(serverValue);
  }

  return [state, setState];
}
