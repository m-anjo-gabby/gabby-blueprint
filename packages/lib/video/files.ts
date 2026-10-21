/**
 * ビデオのファイル（動画・サムネイル）の種類・大きさの制限と、バケットの中のキーの組み立て。
 * ブラウザ（選んだファイルの事前の確認）とサーバー（storage.ts）の両方で使うため、置き場所に依らない処理だけを置く。
 */

export type VideoFileKind = 'video' | 'thumbnail';

/** 種類ごとに受け付ける MIME タイプと、キーに付ける拡張子 */
export const VIDEO_FILE_TYPES: Record<VideoFileKind, Readonly<Record<string, string>>> = {
  video: { 'video/mp4': 'mp4' },
  thumbnail: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' },
};

/**
 * 1ファイルの上限（バイト）。
 * 動画は、旧システムの最も大きいもの（約 380MB。取り込みでは 720p に作り直す）を作り直さずに置ける大きさにする
 * （R2 の1回の PUT の上限は 5GB）。
 */
export const VIDEO_FILE_MAX_BYTES: Record<VideoFileKind, number> = {
  video: 500 * 1024 * 1024,
  thumbnail: 5 * 1024 * 1024,
};

/** ブラウザから直接ファイルを送る先（storage.ts が作る） */
export interface VideoUploadTarget {
  /** 保存するキー（アップロードが済んだら com_m_video の列に書く） */
  key: string;
  /** ブラウザからファイルを PUT する先 */
  url: string;
  /** PUT に付けるヘッダー */
  headers: Record<string, string>;
}

export type VideoFileCheckError = 'unsupported_type' | 'file_too_large' | 'empty_file';

/** アップロードの前に、種類と大きさが受け付けられるかを確かめる */
export function checkVideoFile(
  kind: VideoFileKind,
  file: { type: string; size: number },
): { ok: true; extension: string } | { ok: false; error: VideoFileCheckError } {
  const extension = VIDEO_FILE_TYPES[kind][file.type];
  if (!extension) return { ok: false, error: 'unsupported_type' };
  if (file.size <= 0) return { ok: false, error: 'empty_file' };
  if (file.size > VIDEO_FILE_MAX_BYTES[kind]) return { ok: false, error: 'file_too_large' };
  return { ok: true, extension };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 新しいファイルのキー（{video_id}/{uuid}.<拡張子>）を作る。
 * 差し替えのたびに別のキーにする（署名付き URL・ブラウザのキャッシュに古いファイルを残さないため）。
 */
export function buildVideoObjectKey(videoId: string, extension: string, fileId: string = crypto.randomUUID()): string {
  if (!UUID_PATTERN.test(videoId)) throw new Error(`Invalid video id: ${videoId}`);
  if (!UUID_PATTERN.test(fileId)) throw new Error(`Invalid file id: ${fileId}`);
  if (!/^[a-z0-9]+$/.test(extension)) throw new Error(`Invalid extension: ${extension}`);
  return `${videoId.toLowerCase()}/${fileId.toLowerCase()}.${extension}`;
}

/** キーがそのビデオのもの（{video_id}/ で始まる、組み立てた形）かを確かめる。ブラウザから戻ってきたキーを保存する前に使う */
export function isVideoObjectKeyOf(videoId: string, key: string): boolean {
  const match = /^([^/]+)\/([^/.]+)\.([a-z0-9]+)$/.exec(key);
  return !!match && match[1] === videoId.toLowerCase() && UUID_PATTERN.test(match[2]);
}
