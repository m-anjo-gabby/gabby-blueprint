'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { clientLogger } from '../logger/client';

/** 指定した要素をブラウザの全画面表示に出し入れする（Fullscreen API） */
export function useFullscreen<T extends HTMLElement>(targetRef: RefObject<T | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(document.fullscreenElement === targetRef.current);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [targetRef]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await targetRef.current?.requestFullscreen();
      }
    } catch (err) {
      clientLogger.debug('ui:toggle_fullscreen_failed', 'Failed to toggle fullscreen', { err });
    }
  }, [targetRef]);

  return { isFullscreen, toggleFullscreen };
}
