'use client';

// NOTE: ZoomVideo.createLocalAudioTrack/createLocalVideoTrackは、client.join()前に
// マイク/カメラをプレビューするための専用API（@zoom/videosdk 2.5.0の型定義で確認済み）。
// セッションのclientインスタンスとは独立して動作する。
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureZoomClientInitialized } from '../client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LocalAudioTrack = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LocalVideoTrack = any;

const VOLUME_POLL_INTERVAL_MS = 200;
// LocalAudioTrack.getCurrentVolume()の戻り値スケールはSDKの型定義に明記されていない。
// 当初は同SDKの`current-audio-level-change`イベント（0〜9のレベル値）に合わせて9を上限と仮定したが、
// 実機検証でマイクに近づいて大声で発話しても1/3程度までしか振れなかったため、実測に基づき1に修正。
const ASSUMED_MAX_RAW_VOLUME = 1;

function normalizeMicVolume(raw: number): number {
  const ratio = Math.min(1, Math.max(0, raw / ASSUMED_MAX_RAW_VOLUME));
  return Math.round(Math.sqrt(ratio) * 100);
}

/**
 * @zoom/videosdkのエラーは通常のErrorとは限らず、{type, reason, errorCode}形式
 * （ExecutedFailure）で返ることがある。console.error(err)だけだと（特にNext.jsの開発者
 * オーバーレイ経由では）中身が「{}」に潰れて見えるため、name/message/reasonを明示的に取り出す。
 */
function describeZoomError(err: unknown): { detail: unknown; message: string } {
  if (err instanceof Error) {
    return { detail: { name: err.name, message: err.message }, message: err.message || err.name };
  }
  if (err && typeof err === 'object') {
    const e = err as { type?: string; reason?: string; errorCode?: number };
    if (e.type || e.reason) {
      return { detail: e, message: [e.type, e.reason].filter(Boolean).join(': ') || 'Unknown error' };
    }
  }
  return { detail: err, message: 'Unknown error' };
}

interface UseZoomDevicePreviewResult {
  isPreviewing: boolean;
  isMicOn: boolean;
  isCameraOn: boolean;
  /** 背景ぼかしのON/OFF */
  isBlurOn: boolean;
  /** マイク入力レベル（0〜100に正規化済み。ミュート中も入力自体は継続しているため計測できる） */
  micVolume: number;
  errorMessage: string | null;
  /**
   * previewElementはcanvas要素を渡すこと。SDK仕様上、video要素では背景ぼかし合成後の映像が
   * 正しく描画されない（公式ドキュメントがCanvas/VideoPlayer要素の使用を推奨している）。
   */
  startPreview: (previewElement: HTMLCanvasElement) => Promise<void>;
  stopPreview: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCamera: (previewElement: HTMLCanvasElement) => Promise<void>;
  toggleBlur: (previewElement: HTMLCanvasElement) => Promise<void>;
}

/**
 * ルーム入室前に、ローカルのカメラ/マイクをプレビュー確認するための共有hook。
 * UIテキストは一切持たず、状態とハンドラのみを返す。
 */
export function useZoomDevicePreview(): UseZoomDevicePreviewResult {
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isBlurOn, setIsBlurOn] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearVolumePolling = useCallback(() => {
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
  }, []);

  const startPreview = useCallback(async (previewElement: HTMLCanvasElement) => {
    setErrorMessage(null);
    try {
      // 仮想背景（ぼかし）付きのローカルプレビューはclient.init()が完了していないと失敗するため、
      // トラック生成前に必ずクライアント初期化を待つ（join()前でもセッションには接続しない）
      await ensureZoomClientInitialized();
      const { default: ZoomVideo } = await import('@zoom/videosdk');

      const videoTrack = ZoomVideo.createLocalVideoTrack();
      videoTrackRef.current = videoTrack;
      await videoTrack.start(previewElement);
      setIsCameraOn(true);

      // 入室前はマイクをミュート状態で開始する（SDK仕様。入力レベル計測自体はミュート中も可能）
      const audioTrack = ZoomVideo.createLocalAudioTrack();
      audioTrackRef.current = audioTrack;
      await audioTrack.start();
      setIsMicOn(false);

      clearVolumePolling();
      volumeIntervalRef.current = setInterval(() => {
        setMicVolume(normalizeMicVolume(audioTrackRef.current?.getCurrentVolume() ?? 0));
      }, VOLUME_POLL_INTERVAL_MS);

      setIsPreviewing(true);
    } catch (err) {
      const { detail, message } = describeZoomError(err);
      console.error('Failed to start device preview:', message, detail);
      setErrorMessage(message);
    }
  }, [clearVolumePolling]);

  const stopPreview = useCallback(async () => {
    clearVolumePolling();
    try {
      await videoTrackRef.current?.stop();
      await audioTrackRef.current?.stop();
    } catch (err) {
      console.error('Failed to stop device preview', err);
    } finally {
      videoTrackRef.current = null;
      audioTrackRef.current = null;
      setIsPreviewing(false);
      setIsMicOn(false);
      setIsCameraOn(false);
      setIsBlurOn(false);
      setMicVolume(0);
    }
  }, [clearVolumePolling]);

  const toggleMic = useCallback(async () => {
    const audioTrack = audioTrackRef.current;
    if (!audioTrack) return;
    if (isMicOn) {
      await audioTrack.mute();
    } else {
      await audioTrack.unmute();
    }
    setIsMicOn((prev) => !prev);
  }, [isMicOn]);

  const toggleCamera = useCallback(
    async (previewElement: HTMLCanvasElement) => {
      const videoTrack = videoTrackRef.current;
      if (!videoTrack) return;
      if (isCameraOn) {
        await videoTrack.stop();
      } else {
        // ぼかし設定はカメラOFF/ON後も維持する
        await videoTrack.start(previewElement, isBlurOn ? { imageUrl: 'blur' } : undefined);
      }
      setIsCameraOn((prev) => !prev);
    },
    [isCameraOn, isBlurOn]
  );

  const toggleBlur = useCallback(
    async (previewElement: HTMLCanvasElement) => {
      const videoTrack = videoTrackRef.current;
      if (!videoTrack || !isCameraOn) return;
      try {
        const next = !isBlurOn;
        // updateVirtualBackground()単体では反映されないケースがあったため、
        // カメラをOFF/ON状態と同じ「start()にvirtualBackgroundを渡す」経路で確実に反映させる
        await videoTrack.stop();
        await videoTrack.start(previewElement, next ? { imageUrl: 'blur' } : undefined);
        setIsBlurOn(next);
      } catch (err) {
        const { detail, message } = describeZoomError(err);
        console.error('Failed to toggle background blur:', message, detail);
        setErrorMessage(message);
      }
    },
    [isBlurOn, isCameraOn]
  );

  useEffect(() => clearVolumePolling, [clearVolumePolling]);

  return {
    isPreviewing,
    isMicOn,
    isCameraOn,
    isBlurOn,
    micVolume,
    errorMessage,
    startPreview,
    stopPreview,
    toggleMic,
    toggleCamera,
    toggleBlur,
  };
}
