import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger, type LogContext, type LogEventName } from '../logger';

const logger = createLogger('common');

/** Storage の一括削除の1回あたりの件数 */
const REMOVE_CHUNK = 100;

interface RemoveStorageFilesOptions {
  /** 失敗した時のエラーのログのイベント名（例: 'notice:delete_files_failed'） */
  event: LogEventName;
  ctx?: LogContext;
  /** ログに添える識別子（ID 等。氏名などの個人情報は入れない） */
  payload?: Record<string, unknown>;
}

/**
 * 行を削除した後に、その行が持っていた Storage のファイルを消す（規約は docs/DATA-DELETION.md）。
 * 失敗しても例外にせず、エラーのログだけを残す（DB の削除は取り消さない。ログで気付いて手で片付ける）。
 * 既に無いファイルはエラーにならない。null・空文字・重複は除く。
 */
export async function removeStorageFiles(
  supabase: SupabaseClient,
  bucket: string,
  paths: readonly (string | null | undefined)[],
  { event, ctx, payload }: RemoveStorageFilesOptions,
): Promise<void> {
  const targets = [...new Set(paths.filter((p): p is string => !!p).map((p) => p.replace(/^\/+/, '')))];
  for (let i = 0; i < targets.length; i += REMOVE_CHUNK) {
    const chunk = targets.slice(i, i + REMOVE_CHUNK);
    try {
      const { error } = await supabase.storage.from(bucket).remove(chunk);
      if (error) throw error;
    } catch (err) {
      logger.error(event, err instanceof Error ? err.message : 'Unknown error', {
        ...ctx,
        err,
        payload: { ...payload, bucket, paths: chunk },
      });
    }
  }
}
