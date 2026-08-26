/** プレビュー可能なファイル拡張子のホワイトリスト */
const PREVIEWABLE_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'txt'
]);

/**
 * ファイルがプレビュー（ブラウザ内表示）可能か判定する
 */
export function isPreviewableFile(fileName: string, mimeType?: string): boolean {
  if (mimeType) {
    if (
      mimeType.startsWith('image/') ||
      mimeType === 'application/pdf' ||
      mimeType.startsWith('text/plain')
    ) {
      return true;
    }
  }
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext ? PREVIEWABLE_EXTENSIONS.has(ext) : false;
}

/**
 * Blob 化によりブラウザ内表示を回避し、ファイルを強制ダウンロード保存する
 */
export async function forceDownloadFile(url: string, fileName: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch file');
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
