import pino from 'pino';

/**
 * ログレベルの定義
 */
export type LogService = 'admin' | 'student' | 'coach' | 'api' | 'worker' | 'common' | 'mail' | 'monitor';
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
  ip?: string;        // アクセス元IPアドレス
  requestId?: string; // Middleware (proxy) が発行するリクエスト単位のトレースID
  functionName?: string;
  timestamp?: string;
  payload?: any;      // 追加のコンテキスト情報
  impersonation?: { id: string; adminId: string }; // 代理ログイン中の操作である場合のみ付与される相関情報
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

// ログに出力してはいけない機微情報のキー名パターン（キー名ベースで再帰的に検出しマスクする）
const SENSITIVE_KEY_PATTERN = /password|token|secret|authorization|api[-_]?key/i;
const MAX_ARRAY_LENGTH = 20;
const MAX_STRING_LENGTH = 1000;
const MAX_SANITIZE_DEPTH = 5;

/**
 * ログのpayloadを再帰的に走査し、以下を行う。
 * - 機微情報らしきキー(password/token等)の値をマスク
 * - 大きすぎる配列/文字列を切り詰め、ログサイズの肥大化を防止
 */
function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return '[Truncated: max depth exceeded]';

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      return {
        truncated: true,
        length: value.length,
        sample: value.slice(0, 3).map((v) => sanitizeForLog(v, depth + 1)),
      };
    }
    return value.map((v) => sanitizeForLog(v, depth + 1));
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...(truncated, ${value.length} chars)`
      : value;
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeForLog(v, depth + 1);
    }
    return result;
  }

  return value;
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

    // payload は呼び出し元が自由に詰められるフィールドのため、機微情報マスキングとサイズ抑制を一律で適用
    if (data.payload !== undefined) {
      data.payload = sanitizeForLog(data.payload);
    }

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

/**
 * リクエストオブジェクトからクライアントIPアドレスを抽出する。
 * Vercel/プロキシ環境では x-real-ip または x-forwarded-for を優先し、
 * フォールバックとして req.ip (型定義になくても実行時には存在する場合がある) を使用する。
 */
export function extractIpFromRequest(req: { headers: { get: (name: string) => string | null } }): string | undefined {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return (req as any).ip || undefined;
}

/**
 * Middleware (proxy) 用ロガーファクトリ。
 * NextRequest を受け取り、IPアドレスをすべてのログ呼び出しに自動付与したロガーを返す。
 * proxy ファイル側での clientIp 抽出は不要。
 *
 * @example
 * const logger = createRequestLogger('student', req, requestId);
 * logger.info('page_view', `Access: ${pathname}`, { userId, path });
 */
export const createRequestLogger = (
  service: LogService,
  req: { headers: { get: (name: string) => string | null } },
  requestId?: string
) => {
  const ip = extractIpFromRequest(req);
  const base = createLogger(service);

  const withRequestContext = (context?: Partial<LogEvent>): Partial<LogEvent> => ({
    ...(ip ? { ip } : {}),
    ...(requestId ? { requestId } : {}),
    ...context,
  });

  return {
    info: (event: string, message: string, context?: Partial<LogEvent>) =>
      base.info(event, message, withRequestContext(context)),
    warn: (event: string, message: string, context?: Partial<LogEvent>) =>
      base.warn(event, message, withRequestContext(context)),
    error: (event: string, message: string, context?: Partial<LogEvent>) =>
      base.error(event, message, withRequestContext(context)),
    debug: (event: string, message: string, context?: Partial<LogEvent>) =>
      base.debug(event, message, withRequestContext(context)),
  };
};