import { unstable_rethrow } from 'next/navigation';
import 'server-only';
import { createLogger, type LogContext } from '../logger';
import { getErrorMessage } from '../logger/errorMessage';
import { createR2Bucket, readR2BucketConfig, type R2Bucket } from '../r2/bucket';
import {
  buildVideoObjectKey,
  checkVideoFile,
  type VideoFileCheckError,
  type VideoFileKind,
  type VideoUploadTarget,
} from './files';

/**
 * ビデオのファイルの置き場所。URL の発行・アップロード・削除はこのモジュールだけで行い、画面・DB はキーだけを扱う。
 *
 * 置き場所は Cloudflare R2 の環境ごとの非公開のバケット（R2_VIDEO_BUCKET。blueprint-video-dev / -stg / -prod）。
 * 読み出しもアップロードもサーバーが発行する署名付き URL で行い、バケットを公開しない
 * （ファイルの置き場所の決まりは supabase/DDL/README.md「ファイルの置き場所」）。
 *
 * どの関数も呼び出し元の権利を確かめない。呼ぶ前に、URL は利用者の権限（RLS）でビデオの行が見えること、
 * アップロード・削除は admin の権利（requireAdminRole）を確かめる（docs/SECURITY.md 4章）。
 */

const logger = createLogger('common');

/** 再生用の URL の有効期間。視聴の途中で切れると続きを読めなくなるため、長めにする */
const DEFAULT_URL_TTL_SEC = 4 * 60 * 60;

/** アップロード用の URL の有効期間。大きな動画を遅い回線で送っても途中で切れない長さにする */
const UPLOAD_URL_TTL_SEC = 2 * 60 * 60;

let bucket: R2Bucket | undefined;

function videoBucket(): R2Bucket {
  bucket ??= createR2Bucket(readR2BucketConfig('R2_VIDEO_BUCKET'));
  return bucket;
}

/**
 * ブラウザから直接アップロードする先を作る（Vercel の関数の本文の上限を越える大きさのため、サーバーを通さない）。
 * ブラウザは `fetch(url, { method: 'PUT', headers, body: file })` で送る（バケットの CORS で admin のオリジンに PUT を許す）。
 */
export async function createVideoUploadTarget(
  kind: VideoFileKind,
  videoId: string,
  file: { type: string; size: number },
): Promise<{ ok: true; target: VideoUploadTarget } | { ok: false; error: VideoFileCheckError | 'storage_error' }> {
  const checked = checkVideoFile(kind, file);
  if (!checked.ok) return checked;

  const key = buildVideoObjectKey(videoId, checked.extension);
  try {
    const url = await videoBucket().presignPut(key, UPLOAD_URL_TTL_SEC);
    return { ok: true, target: { key, url, headers: { 'content-type': file.type } } };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('video:create_upload_url_failed', getErrorMessage(err), { err, payload: { key } });
    return { ok: false, error: 'storage_error' };
  }
}

/** アップロード済みのファイルの大きさと種類（無ければ null）。ブラウザが送ったと言うキーを保存する前に確かめる */
export async function getVideoFileInfo(key: string): Promise<{ size: number; contentType: string | null } | null> {
  try {
    return await videoBucket().head(key);
  } catch (err) {
    unstable_rethrow(err);
    logger.error('video:get_file_info_failed', getErrorMessage(err), { err, payload: { key } });
    return null;
  }
}

/**
 * 再生・表示用の署名付き URL をまとめて作る（キー → URL）。空・重複のキーは除く。
 * 署名は手元の計算だけで済む（R2 に問い合わせない）ため、ファイルが無いキーにも URL を返す。
 */
export async function getVideoFileUrls(
  keys: readonly (string | null | undefined)[],
  ttlSec: number = DEFAULT_URL_TTL_SEC,
): Promise<Map<string, string>> {
  const targets = [...new Set(keys.filter((k): k is string => !!k))];
  const urls = new Map<string, string>();
  if (targets.length === 0) return urls;

  const signed = await Promise.all(targets.map((key) => videoBucket().presignGet(key, ttlSec)));
  targets.forEach((key, i) => urls.set(key, signed[i]));
  return urls;
}

/**
 * ファイルを消す（行の削除・ファイルの差し替えの後に呼ぶ。docs/DATA-DELETION.md §1）。
 * 失敗しても例外にせず、`video:delete_files_failed` のエラーのログを残す（DB の削除は取り消さない。ログで気付いて手で片付ける）。
 */
export async function removeVideoFiles(
  keys: readonly (string | null | undefined)[],
  { ctx, payload }: { ctx?: LogContext; payload?: Record<string, unknown> } = {},
): Promise<void> {
  const targets = [...new Set(keys.filter((k): k is string => !!k))];
  if (targets.length === 0) return;
  try {
    const { failed } = await videoBucket().remove(targets);
    if (failed.length === 0) return;
    logger.error('video:delete_files_failed', getErrorMessage(failed[0].error), {
      ...ctx,
      err: failed[0].error,
      payload: { ...payload, keys: failed.map((f) => f.key) },
    });
  } catch (err) {
    unstable_rethrow(err);
    logger.error('video:delete_files_failed', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { ...payload, keys: targets },
    });
  }
}
