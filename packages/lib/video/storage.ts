import 'server-only';
import type { LogContext } from '../logger';
import { removeStorageFiles } from '../storage/removeStorageFiles';
import { createAdminClient } from '../supabase/admin';
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
 * 置き場所は Cloudflare R2（環境ごとの非公開のバケット）にする。R2 の準備ができるまでは、dev だけ
 * Supabase Storage の一時のバケット（video。非公開・1ファイル 50MB まで。DDL の正本・リリーススクリプトには入れず、
 * dev に手で作った）を使う。R2 に移す時はこのファイルと環境変数だけを書き換え、dev のファイルを入れ直して
 * 一時のバケットを消す。それまでは staging・本番にビデオの機能を出さない。
 *
 * どの関数も呼び出し元の権利を確かめない。呼ぶ前に、URL は利用者の権限（RLS）でビデオの行が見えること、
 * アップロード・削除は admin の権利（requireAdminRole）を確かめる（docs/SECURITY.md 4章）。
 */

const BUCKET = 'video';

/** 再生用の URL の有効期間。視聴の途中で切れると続きを読めなくなるため、長めにする */
const DEFAULT_URL_TTL_SEC = 4 * 60 * 60;

/**
 * ブラウザから直接アップロードする先を作る（Vercel の関数の本文の上限を越える大きさのため、サーバーを通さない）。
 * ブラウザは `fetch(url, { method: 'PUT', headers, body: file })` で送る。
 */
export async function createVideoUploadTarget(
  kind: VideoFileKind,
  videoId: string,
  file: { type: string; size: number },
): Promise<{ ok: true; target: VideoUploadTarget } | { ok: false; error: VideoFileCheckError | 'storage_error' }> {
  const checked = checkVideoFile(kind, file);
  if (!checked.ok) return checked;

  const key = buildVideoObjectKey(videoId, checked.extension);
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(key);
  if (error || !data) return { ok: false, error: 'storage_error' };
  return { ok: true, target: { key, url: data.signedUrl, headers: { 'content-type': file.type } } };
}

/** アップロード済みのファイルの大きさと種類（無ければ null）。ブラウザが送ったと言うキーを保存する前に確かめる */
export async function getVideoFileInfo(key: string): Promise<{ size: number; contentType: string | null } | null> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).info(key);
  if (error || !data) return null;
  return { size: data.size ?? 0, contentType: data.contentType ?? null };
}

/**
 * 再生・表示用の署名付き URL をまとめて作る（キー → URL）。空・重複のキーは除き、作れなかったキーは含めない。
 */
export async function getVideoFileUrls(
  keys: readonly (string | null | undefined)[],
  ttlSec: number = DEFAULT_URL_TTL_SEC,
): Promise<Map<string, string>> {
  const targets = [...new Set(keys.filter((k): k is string => !!k))];
  const urls = new Map<string, string>();
  if (targets.length === 0) return urls;

  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrls(targets, ttlSec);
  if (error) throw error;
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

/**
 * ファイルを消す（行の削除・ファイルの差し替えの後に呼ぶ。docs/DATA-DELETION.md §1）。
 * 失敗しても例外にせず、`video:delete_files_failed` のエラーのログを残す。
 */
export async function removeVideoFiles(
  keys: readonly (string | null | undefined)[],
  options: { ctx?: LogContext; payload?: Record<string, unknown> } = {},
): Promise<void> {
  await removeStorageFiles(createAdminClient(), BUCKET, keys, { event: 'video:delete_files_failed', ...options });
}
