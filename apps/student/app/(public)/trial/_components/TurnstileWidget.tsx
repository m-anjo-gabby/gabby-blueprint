'use client';

import Script from 'next/script';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

/*
 * Cloudflare Turnstile（CAPTCHA）のウィジェット。Cloudflare の公式スクリプトを読み込み、明示的に描画する。
 * トークンは1回しか使えないため、送信に失敗したら reset() で取り直す。検証はサーバー（verifyTurnstileToken）で行う。
 */

interface TurnstileRenderOptions {
  sitekey: string;
  language?: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileWidgetHandle {
  reset: () => void;
}

interface TurnstileWidgetProps {
  siteKey: string;
  /** トークンが得られた・期限切れになった（null）とき */
  onTokenChange: (token: string | null) => void;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(function TurnstileWidget(
  { siteKey, onTokenChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  const render = useCallback(() => {
    if (!window.turnstile || !containerRef.current || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      language: 'ja',
      callback: (token) => onTokenChangeRef.current(token),
      'expired-callback': () => onTokenChangeRef.current(null),
      'error-callback': () => onTokenChangeRef.current(null),
    });
  }, [siteKey]);

  // 別の画面から戻ってきた場合など、スクリプトが読み込み済みならその場で描画する
  useEffect(() => {
    render();
    return () => {
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [render]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenChangeRef.current(null);
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    },
  }));

  return (
    <>
      <Script src={SCRIPT_URL} strategy="afterInteractive" onReady={render} />
      <div ref={containerRef} className="min-h-[65px]" />
    </>
  );
});
