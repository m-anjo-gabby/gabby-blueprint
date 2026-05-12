// packages/lib/logger/logger.ts

export type LogService = 'admin' | 'student' | 'api' | 'worker';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Axiomで分析しやすい構造化ログのインターフェース
 */
export interface LogEvent {
  service: LogService;
  level: LogLevel;
  event: string;      // 例: 'auth:login', 'auth:unauthorized'
  message: string;
  userId?: string;
  path?: string;
  payload?: any;      // 追加のコンテキスト情報
  timestamp?: string;
  [key: string]: any; // その他のプロパティ
}

export const createLogger = (service: LogService) => {
  const log = (level: LogLevel, event: string, message: string, context?: Partial<LogEvent>) => {
    const data: LogEvent = {
      service,
      level,
      event,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    };

    // 本番(Vercel)ではJSON文字列として出力することでAxiomが自動パースする
    // 開発環境でも構造化ログとして確認可能
    const output = JSON.stringify(data);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
        // 本番環境ではdebugログは出力しない
        if (process.env.NODE_ENV !== 'production') {
          console.debug(output);
        }
        break;
      default:
        console.log(output);
        break;
    }
  };

  return {
    info: (event: string, message: string, context?: Partial<LogEvent>) => log('info', event, message, context),
    warn: (event: string, message: string, context?: Partial<LogEvent>) => log('warn', event, message, context),
    error: (event: string, message: string, context?: Partial<LogEvent>) => log('error', event, message, context),
    debug: (event: string, message: string, context?: Partial<LogEvent>) => log('debug', event, message, context),
  };
};