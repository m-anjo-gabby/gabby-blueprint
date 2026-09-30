'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// 表示したことのあるサーバー描画のID（タブ内で共有）
const seenRenderIds = new Set<string>();

/**
 * キャッシュ済みの画面（前回取得したデータ）が再利用された場合に、サーバーから取り直す。
 * Next.js はブラウザの「戻る・進む」等でキャッシュ済みの画面を再利用するため、その間に他の画面で行った変更
 * （お気に入り登録等）が反映されない。サーバーは描画のたびに新しい renderId を渡すので、
 * 既に表示したことのある renderId でマウントされた＝キャッシュの再利用と判定して router.refresh() する
 * （renderId はサーバーで @gabby/lib/navigation/renderId の createRenderId() で作る）。
 * （popstate の検知は、Next.js が遷移を先に反映するため順序が保証されず使えない）
 * 取り直したデータは props として届くので、画面側は useServerSyncedState で受け取る。
 */
export function useRefreshOnRestoredRender(renderId: string): void {
  const router = useRouter();
  // このコンポーネント（同じマウント）で処理済みの renderId。開発時の StrictMode は effect を2回実行するため、
  // 2回目を「キャッシュの再利用」と誤判定しないようにする（ref は StrictMode の再実行でも保持される）
  const handledRenderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (handledRenderIdRef.current === renderId) return;
    handledRenderIdRef.current = renderId;

    if (seenRenderIds.has(renderId)) {
      router.refresh();
      return;
    }
    seenRenderIds.add(renderId);
  }, [renderId, router]);
}
