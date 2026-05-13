import pino from 'pino';
import { headers } from "next/headers";

/**
 * ログレベルの定義
 */
export type LogService = 'admin' | 'student' | 'api' | 'worker';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Axiom等のログ解析ツールで扱いやすい構造化ログのインターフェース
 */
export interface LogEvent {
  service: LogService;
  level: LogLevel;
  event: string;      // 例: 'auth:login', 'client:update_success'
  message: string;
  userId?: string;
  functionName?: string;
  timestamp?: string;
  payload?: any;      // 追加のコンテキスト情報
  [key: string]: any;
}

/**
 * Pino インスタンスの設定
 * 高速なシリアライズと、環境に応じた出力形式の切り替えを行います。
 */
const p = pino({
  level: process.env.LOG_LEVEL || 'info',
  // タイムスタンプを標準的な ISO 8601 形式に設定
  timestamp: pino.stdTimeFunctions.isoTime,
  // 開発環境 (ローカル) では pino-pretty を使用して可読性を高める
  transport: process.env.NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: { 
          colorize: true, 
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname' // 不要なメタデータを非表示
        }
      }
    : undefined,
});

/**
 * Middleware (proxy-base) でセットされたカスタムヘッダーから
 * 認証ユーザーID等のコンテキストを抽出する。
 * * @returns {Promise<Partial<LogEvent>>} ログに付与するコンテキスト
 */
export async function getLogContext(): Promise<Partial<LogEvent>> {
  try {
    const h = await headers();
    const userId = h.get('x-user-id');
    return {
      userId: userId ?? 'system',
    };
  } catch {
    // Server Actions 以外（ビルド時や Edge Runtime 以外の特殊な文脈）でのフォールバック
    return { userId: 'system' };
  }
}

/**
 * スタックトレースから呼び出し元の関数名を取得する。
 * getLogContext 等を経由するため、スタックの階層位置を調整。
 */
function getCallerName(): string | undefined {
  const error = new Error();
  const stack = error.stack?.split('\n');
  
  // [0]: Error
  // [1]: getCallerName
  // [2]: log (internal)
  // [3]: info/error/warn
  // [4]: 実際の呼び出し元 (Action関数など)
  const caller = stack?.[4];
  if (!caller) return undefined;

  const match = caller.match(/at\s+(.*)\s+\(/) || caller.match(/at\s+(.*)$/);
  return match ? match[1] : undefined;
}

/**
 * 指定されたサービス名に紐付いたロガーを作成する。
 * * @param service 'admin' | 'student' 等のサービス識別子
 */
export const createLogger = (service: LogService) => {
  const log = (level: LogLevel, event: string, message: string, context?: Partial<LogEvent>) => {
    // context の値を優先しつつ、不足分を自動補完する
    const data: LogEvent = {
      service,
      level,
      event,
      message,
      functionName: context?.functionName || getCallerName(),
      ...context,
    };

    // Pino を使用して出力。第一引数にオブジェクトを渡すと JSON フィールドとして展開される。
    p[level](data, message);
  };

  return {
    info: (event: string, message: string, context?: Partial<LogEvent>) => 
      log('info', event, message, context),
    warn: (event: string, message: string, context?: Partial<LogEvent>) => 
      log('warn', event, message, context),
    error: (event: string, message: string, context?: Partial<LogEvent>) => 
      log('error', event, message, context),
    debug: (event: string, message: string, context?: Partial<LogEvent>) => 
      log('debug', event, message, context),
  };
};