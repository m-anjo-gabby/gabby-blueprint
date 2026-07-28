'use server';

import { createLogger, getLogContext } from './index';

// ロガー自体のインスタンスを生成
const logger = createLogger('common');

interface LogClientErrorParams {
  service?: 'admin' | 'student' | 'coach' | 'common';
  digest?: string;
  message: string;
  stack?: string;
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