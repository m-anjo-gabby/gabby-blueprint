'use client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZoomClient = any;

let clientInitPromise: Promise<ZoomClient> | null = null;

/**
 * ページ内で初めて呼ばれた時だけ ZoomVideo.createClient() + client.init() を実行し、
 * 以降は同じPromiseを返す（モジュールスコープでキャッシュ）。
 *
 * 【背景】ZoomVideo.createClient()自体はSDK内部でシングルトンを返す仕様だが、client.init()を
 * 呼ばないうちは仮想背景（ぼかし）を伴うローカルプレビュー（LocalVideoTrack.start）が
 * "Cannot preview video with virtual background before `client.init` method" で失敗する。
 * ルーム入室前プレビューとセッション参加(join)の両方でこの関数経由でクライアントを取得することで、
 * どちらを先に使っても必ずinit済みの状態にし、かつinit()の二重呼び出しを避ける。
 */
export function ensureZoomClientInitialized(): Promise<ZoomClient> {
  if (!clientInitPromise) {
    clientInitPromise = (async () => {
      const { default: ZoomVideo } = await import('@zoom/videosdk');
      const client = ZoomVideo.createClient();
      // SharedArrayBuffer（COOP/COEPヘッダ）無しでも動作させるため、複数動画レンダリングと
      // 背景ぼかし（仮想背景）処理を強制する。1on1通話（自分+相手1名）はデフォルト上限(4)内に収まるため
      // disableRenderLimits は不要。
      await client.init('en-US', 'Global', { enforceMultipleVideos: true, enforceVirtualBackground: true });
      return client;
    })();
  }
  return clientInitPromise;
}
