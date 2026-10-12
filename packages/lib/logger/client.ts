import type { LogEventName } from './index';
import { sanitizeForLog, serializeError } from './sanitize';

/**
 * ブラウザ側のログ。warn / error / info はサーバーの受け口（/api/client-log）へ送り、サーバーのログと同じ Axiom に載せる。
 * debug は送らず、開発中のコンソール表示だけにする。ルールは docs/LOGGING.md を参照。
 *
 * - 送信は navigator.sendBeacon（画面を閉じる直前でも届く。Server Action と違い、他のサーバーアクションの順番待ちに割り込まない）
 * - 送信の失敗は利用者の操作に影響させない（例外を投げない）
 * - 同じ内容の連続送信と、1回の表示あたりの送信数を抑える（描画ループ等で大量に送らない）
 */

export const CLIENT_LOG_PATH = '/api/client-log';

export type ClientLogLevel = 'info' | 'warn' | 'error';

export interface ClientLogContext {
  /** 発生したエラー（Error・throw された任意の値） */
  err?: unknown;
  /** 調査に要る追加の値（ID・状態等）。氏名・本文等の個人情報は入れない */
  payload?: Record<string, unknown>;
}

/** 受け口へ送る本文（受け口側の検証は clientLogRoute.ts） */
export interface ClientLogBody {
  event: LogEventName;
  level: ClientLogLevel;
  message: string;
  path?: string;
  err?: unknown;
  payload?: unknown;
}

const MAX_SENDS_PER_PAGE = 50;
const DEDUPE_WINDOW_MS = 10_000;
const isDev = process.env.NODE_ENV !== 'production';

let sentCount = 0;
const recentlySent = new Map<string, number>();

function shouldSend(key: string): boolean {
  const now = Date.now();
  const last = recentlySent.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
  if (sentCount >= MAX_SENDS_PER_PAGE) return false;
  recentlySent.set(key, now);
  sentCount += 1;
  return true;
}

function send(body: ClientLogBody): void {
  if (typeof window === 'undefined') return;
  try {
    const json = JSON.stringify(body);
    const sent = typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon(CLIENT_LOG_PATH, new Blob([json], { type: 'application/json' }));
    if (!sent) {
      void fetch(CLIENT_LOG_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
        keepalive: true,
      }).catch(() => { /* 送信の失敗は無視する */ });
    }
  } catch {
    /* 送信の失敗は無視する */
  }
}

function printToConsole(level: ClientLogLevel | 'debug', event: LogEventName, message: string, context?: ClientLogContext): void {
  if (!isDev) return;
  // eslint-disable-next-line no-console -- 開発中の表示はここに集約する（docs/LOGGING.md）
  console[level](`[${event}] ${message}`, ...(context?.err !== undefined ? [context.err] : []), ...(context?.payload ? [context.payload] : []));
}

function report(level: ClientLogLevel, event: LogEventName, message: string, context?: ClientLogContext): void {
  printToConsole(level, event, message, context);
  if (!shouldSend(`${level}|${event}|${message}`)) return;
  send({
    event,
    level,
    message,
    path: typeof window !== 'undefined' ? window.location.pathname : undefined,
    ...(context?.err != null ? { err: serializeError(context.err) } : {}),
    ...(context?.payload ? { payload: sanitizeForLog(context.payload) } : {}),
  });
}

export const clientLogger = {
  debug: (event: LogEventName, message: string, context?: ClientLogContext) => printToConsole('debug', event, message, context),
  info: (event: LogEventName, message: string, context?: ClientLogContext) => report('info', event, message, context),
  warn: (event: LogEventName, message: string, context?: ClientLogContext) => report('warn', event, message, context),
  error: (event: LogEventName, message: string, context?: ClientLogContext) => report('error', event, message, context),
};
