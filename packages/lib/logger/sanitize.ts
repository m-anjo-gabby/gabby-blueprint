/**
 * ログへ出す値の整形（機微情報のマスク・サイズ抑制・エラーの直列化）。
 * pino に依存しない純粋な関数だけを置く（単体テストの対象。testing/unit/logger-sanitize.test.ts）。
 * ルールは docs/LOGGING.md を参照。
 */

// 値ごと伏せるキー名（キー名ベースで再帰的に検出する）
const SENSITIVE_KEY_PATTERN = /password|passwd|token|secret|authorization|cookie|api[-_]?key/i;
// 文字列中のメールアドレス（DBエラーの details 等にも含まれ得るため、キー名に関係なく伏せる）
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;

const MAX_ARRAY_LENGTH = 20;
const MAX_STRING_LENGTH = 1000;
const MAX_STACK_LENGTH = 4000;
const MAX_DEPTH = 5;
const MAX_CAUSE_DEPTH = 3;

/** メールアドレスを先頭1文字とドメインだけ残して伏せる（例: t***@example.com） */
export function maskEmails(value: string): string {
  return value.replace(EMAIL_PATTERN, (address) => {
    const at = address.indexOf('@');
    return `${address.slice(0, 1)}***${address.slice(at)}`;
  });
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...(truncated, ${value.length} chars)` : value;
}

/** ログに出すエラーの形（Error・Supabase の PostgrestError / AuthError・throw された任意の値を同じ形にそろえる） */
export interface SerializedError {
  type: string;
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  stack?: string;
  cause?: SerializedError;
}

function pickString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (typeof value === 'string' && value !== '') return maskEmails(truncate(value, MAX_STRING_LENGTH));
  if (typeof value === 'number') return String(value);
  return undefined;
}

/**
 * throw・返却されたエラーをログ用の形にする。
 * `Object.entries(new Error())` は空になるため、Error を通常のオブジェクトとして扱うと中身が失われる。
 */
export function serializeError(value: unknown, depth = 0): SerializedError {
  if (value === null || value === undefined || typeof value !== 'object') {
    return { type: typeof value, message: maskEmails(truncate(String(value), MAX_STRING_LENGTH)) };
  }

  const source = value as Record<string, unknown>;
  // ブラウザで整形済みのエラー（/api/client-log）は type を持つ
  const type = value instanceof Error ? value.name : (pickString(source, 'name') ?? pickString(source, 'type') ?? 'Object');
  const status = typeof source.status === 'number' ? source.status : undefined;
  const stack = typeof source.stack === 'string' ? truncate(source.stack, MAX_STACK_LENGTH) : undefined;

  const result: SerializedError = {
    type,
    message: pickString(source, 'message') ?? '',
    code: pickString(source, 'code'),
    details: pickString(source, 'details'),
    hint: pickString(source, 'hint'),
    status,
    stack: stack ? maskEmails(stack) : undefined,
  };
  if (source.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    result.cause = serializeError(source.cause, depth + 1);
  }
  return result;
}

/**
 * payload を再帰的に走査し、次を行う。
 * - 機微情報らしきキー（password / token 等）の値を伏せる
 * - 文字列中のメールアドレスを伏せる
 * - 大きすぎる配列・文字列・深すぎる入れ子を切り詰める
 * - Error は serializeError で中身を残す
 */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[Truncated: max depth exceeded]';

  if (typeof value === 'string') return maskEmails(truncate(value, MAX_STRING_LENGTH));
  if (value instanceof Error) return serializeError(value);
  if (value instanceof Date) return value.toISOString();

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

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeForLog(v, depth + 1);
    }
    return result;
  }

  return value;
}
