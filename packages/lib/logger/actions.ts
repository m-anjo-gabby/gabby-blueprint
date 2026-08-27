'use server';

import { createLogger } from './index';
import { getLogContext } from './context';
import type { LogLevel, LogService } from './index';

// ロガー自体のインスタンスを生成
const logger = createLogger('common');

interface LogClientErrorParams {
  service?: 'admin' | 'student' | 'coach' | 'common';
  digest?: string;
  message: string;
  stack?: string;
}

interface LogClientEventParams {
  service?: LogService;
  /** 例: 'sprint:audio_playback_failed' */
  event: string;
  level?: LogLevel;
  message: string;
  payload?: Record<string, unknown>;
}

/**
 * クライアント側から任意の構造化イベントをサーバー側ログへ送るための汎用 Server Action。
 * 音声再生失敗など「エラーとしてthrowはしないが運用上把握したい」事象の記録に使用する。
 */
export async function logClientEvent({
  service = 'common',
  event,
  level = 'warn',
  message,
  payload,
}: LogClientEventParams) {
  const ctx = await getLogContext();
  const scopedLogger = createLogger(service);

  scopedLogger[level](event, message, {
    ...ctx,
    functionName: 'logClientEvent',
    payload,
  });
}

/**
 * クライアント側（error.tsxやnot-found.tsxなど）から安全に呼び出され、
 * サーバー側で構造化ログを出力する完全隔離された Server Action
 */
export async function logClientError({
  service = 'common',
  digest,
  message,
  stack,
}: LogClientErrorParams) {
  const ctx = await getLogContext();

  // 独立ファイルになったため、Pinoのログで呼び出し元関数名が壊れないようにコンテキストを直接補完
  logger.error('system:runtime_error', message, {
    ...ctx,
    service, // 呼び出し元アプリの識別子を上書き
    functionName: 'logClientError',
    payload: {
      digest: digest ?? 'N/A',
      stack: stack,
    },
  });
}