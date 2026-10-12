import pino from 'pino';
import { maskEmails, sanitizeForLog, serializeError } from './sanitize';

/**
 * サーバー側の構造化ログ（標準出力へ1行1JSON → Vercel のログドレイン → Axiom）。
 * 書き方のルール（イベント名・レベル・出してはいけない値）は docs/LOGGING.md を参照。
 */

export type LogService = 'admin' | 'student' | 'coach' | 'api' | 'worker' | 'common' | 'mail' | 'monitor';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** `<domain>:<action>_<outcome>`（例: 'chat:create_room_failed'）。docs/LOGGING.md「イベント名」 */
export type LogEventName = `${string}:${string}`;

/** ログ1件に付ける文脈。ここに無い値は payload に入れる（payload はマスク・切り詰めの対象） */
export interface LogContext {
  userId?: string;
  /** proxy が発行するリクエスト単位のID（proxy のログと Server Action のログを突き合わせる） */
  requestId?: string;
  ip?: string;
  path?: string;
  functionName?: string;
  /** 代理ログイン中の操作である場合のみ付く */
  impersonation?: { id: string; adminId: string };
  /** ブラウザから送られたログ（/api/client-log）である場合のみ付く。サーバーのログと区別する */
  source?: 'client';
  /** 発生したエラー（Error・Supabase のエラー・throw された任意の値）。type / message / code / details / stack に整形して出す */
  err?: unknown;
  /** 調査に要る追加の値（ID・件数・条件等）。氏名・本文等の個人情報は入れない */
  payload?: unknown;
}

export interface Logger {
  debug: (event: LogEventName, message: string, context?: LogContext) => void;
  info: (event: LogEventName, message: string, context?: LogContext) => void;
  warn: (event: LogEventName, message: string, context?: LogContext) => void;
  error: (event: LogEventName, message: string, context?: LogContext) => void;
}

/**
 * 出力形式: {"level":"info","time":"...","service":"student","event":"x:y","message":"...", ...}
 * - level は文字列1つ（pino 既定の数値の level と重複させない）
 * - 本文は message（pino 既定の msg は使わない）
 * - pid / hostname は Vercel では意味が無いため出さない
 * - err は serializeError、payload は sanitizeForLog で整形してから渡す
 */
const p = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined,
  messageKey: 'message',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  // err は serializeError で整形済み。pino 既定の err の整形を重ねない
  serializers: { err: (value: unknown) => value },
  // ローカル開発では pino-pretty で読みやすく表示する
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', messageKey: 'message' } }
    : undefined,
});

/**
 * 指定したサービス名に紐付いたロガーを作る。
 * @param service 'admin' | 'student' 等のサービス識別子
 */
export const createLogger = (service: LogService): Logger => {
  const log = (level: LogLevel, event: LogEventName, message: string, context?: LogContext) => {
    if (!p.isLevelEnabled(level)) return;
    const { err, payload, ...rest } = context ?? {};
    p[level](
      {
        service,
        event,
        ...rest,
        ...(err != null ? { err: serializeError(err) } : {}),
        ...(payload !== undefined ? { payload: sanitizeForLog(payload) } : {}),
      },
      maskEmails(message),
    );
  };

  return {
    debug: (event, message, context) => log('debug', event, message, context),
    info: (event, message, context) => log('info', event, message, context),
    warn: (event, message, context) => log('warn', event, message, context),
    error: (event, message, context) => log('error', event, message, context),
  };
};

/**
 * リクエストからクライアントIPアドレスを抽出する（Vercel/プロキシ環境では x-real-ip / x-forwarded-for）。
 */
export function extractIpFromRequest(req: { headers: { get: (name: string) => string | null } }): string | undefined {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return undefined;
}

/**
 * proxy 用ロガー。IPアドレスとリクエストIDをすべてのログに自動で付ける。
 *
 * @example
 * const logger = createRequestLogger('student', req, requestId);
 * logger.info('proxy:page_view', `Access: ${pathname}`, { userId, path });
 */
export const createRequestLogger = (
  service: LogService,
  req: { headers: { get: (name: string) => string | null } },
  requestId?: string
): Logger => {
  const ip = extractIpFromRequest(req);
  const base = createLogger(service);

  const withRequestContext = (context?: LogContext): LogContext => ({
    ...(ip ? { ip } : {}),
    ...(requestId ? { requestId } : {}),
    ...context,
  });

  return {
    debug: (event, message, context) => base.debug(event, message, withRequestContext(context)),
    info: (event, message, context) => base.info(event, message, withRequestContext(context)),
    warn: (event, message, context) => base.warn(event, message, withRequestContext(context)),
    error: (event, message, context) => base.error(event, message, withRequestContext(context)),
  };
};
