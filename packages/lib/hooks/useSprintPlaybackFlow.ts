'use client';

import { useEffect } from 'react';

/**
 * Drill/Sprint両プレイヤーで共通の「フルスクリーン固定＋アンマウント時クリーンアップ」ライフサイクル。
 * マウント中は body のスクロールを固定し、アンマウント時に全音声を停止する
 * （オーディオセッションの復帰は audio/core/audioSession が発話セッションの返却時に行う）。
 */
export function useFullscreenAudioLifecycle(stopAllAudio: () => void) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      stopAllAudio();
    };
  }, [stopAllAudio]);
}
