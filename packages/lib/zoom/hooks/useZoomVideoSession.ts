'use client';

// NOTE: 実装前に @zoom/videosdk 2.5.0 の型定義（node_modules/@zoom/videosdk/dist/types/*.d.ts）で
// 下記API（attachVideo/attachShareView, video-player-container要件, イベント名等）を実際に確認済み。
// メジャーバージョンを上げる際は再度突き合わせること。
import { useCallback, useRef, useState } from 'react';
import type { LiveSessionRoomAccess } from '@gabby/types/liveSessionRoom';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZoomClient = any;

// VideoQuality.Video_720P（@zoom/videosdkのランタイムをSSRバンドルに巻き込まないよう、値を直接指定）
const VIDEO_QUALITY_720P = 3;

export interface LiveSessionChatMessage {
  id: string;
  senderName: string;
  message: string;
  timestamp: number;
  isSelf: boolean;
}

interface UseZoomVideoSessionResult {
  isJoined: boolean;
  isJoining: boolean;
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isReceivingScreenShare: boolean;
  chatMessages: LiveSessionChatMessage[];
  errorMessage: string | null;
  /** selfVideoContainer/peerVideoContainerは通常の<div>でよい（内部でvideo-player-containerを生成し格納する） */
  join: (access: LiveSessionRoomAccess, selfVideoContainer: HTMLElement, peerVideoContainer: HTMLElement) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  /** 画面共有の開始/停止（コーチ側のみ使用。送信側はcanvas要素へ描画する必要がある） */
  toggleScreenShare: (shareCanvas: HTMLCanvasElement) => Promise<void>;
  /** 相手の画面共有を表示するコンテナを登録する（生徒側で使用。呼び出しておけばactive-share-change時に自動描画） */
  registerShareViewContainer: (container: HTMLElement | null) => void;
  sendChatMessage: (text: string) => Promise<void>;
}

/** 指定コンテナ配下に、Zoom SDKが要求する<video-player-container>を作り直して返す */
function resetPlayerContainer(wrapper: HTMLElement): HTMLElement {
  wrapper.replaceChildren();
  const playerContainer = document.createElement('video-player-container');
  wrapper.appendChild(playerContainer);
  return playerContainer;
}

/**
 * Zoom Video SDKのクライアントライフサイクル（入退室・映像/音声/画面共有/チャット）を扱う共有hook。
 * UIテキストは一切持たず、状態とハンドラのみを返す（アプリごとのUI文言はコンポーネント側で用意する）。
 */
export function useZoomVideoSession(): UseZoomVideoSessionResult {
  const clientRef = useRef<ZoomClient | null>(null);
  const selfWrapperRef = useRef<HTMLElement | null>(null);
  const peerWrapperRef = useRef<HTMLElement | null>(null);
  const shareViewWrapperRef = useRef<HTMLElement | null>(null);
  const selfIdentityRef = useRef<string>('');

  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isReceivingScreenShare, setIsReceivingScreenShare] = useState(false);
  const [chatMessages, setChatMessages] = useState<LiveSessionChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const renderPeerVideo = useCallback(async (userId: number) => {
    const client = clientRef.current;
    const wrapper = peerWrapperRef.current;
    if (!client || !wrapper) return;
    try {
      const stream = client.getMediaStream();
      const playerContainer = resetPlayerContainer(wrapper);
      const videoElement = await stream.attachVideo(userId, VIDEO_QUALITY_720P);
      if (videoElement instanceof HTMLElement) {
        playerContainer.appendChild(videoElement);
      }
    } catch (err) {
      console.error('Failed to render peer video', err);
    }
  }, []);

  const registerShareViewContainer = useCallback((container: HTMLElement | null) => {
    shareViewWrapperRef.current = container;
  }, []);

  const join = useCallback(
    async (access: LiveSessionRoomAccess, selfVideoContainer: HTMLElement, peerVideoContainer: HTMLElement) => {
      setIsJoining(true);
      setErrorMessage(null);
      selfWrapperRef.current = selfVideoContainer;
      peerWrapperRef.current = peerVideoContainer;
      selfIdentityRef.current = access.userIdentity;

      try {
        const { default: ZoomVideo } = await import('@zoom/videosdk');
        const client = ZoomVideo.createClient();
        clientRef.current = client;

        // SharedArrayBuffer（COOP/COEPヘッダ）無しでも動作させるため、複数動画レンダリングを強制する。
        // 1on1通話（自分+相手1名）はデフォルト上限(4)内に収まるため disableRenderLimits は不要。
        await client.init('en-US', 'Global', { enforceMultipleVideos: true });

        client.on('peer-video-state-change', (payload: { action: 'Start' | 'Stop'; userId: number }) => {
          if (payload.action === 'Start') {
            renderPeerVideo(payload.userId);
          } else {
            peerWrapperRef.current?.replaceChildren();
          }
        });

        client.on('active-share-change', async (payload: { state: 'Active' | 'Inactive'; userId: number }) => {
          const shareWrapper = shareViewWrapperRef.current;
          if (!shareWrapper) return;
          if (payload.state === 'Active') {
            try {
              const stream = client.getMediaStream();
              const playerContainer = resetPlayerContainer(shareWrapper);
              const shareElement = await stream.attachShareView(payload.userId);
              if (shareElement instanceof HTMLElement) {
                playerContainer.appendChild(shareElement);
              }
              setIsReceivingScreenShare(true);
            } catch (err) {
              console.error('Failed to render screen share', err);
            }
          } else {
            shareWrapper.replaceChildren();
            setIsReceivingScreenShare(false);
          }
        });

        client.on('chat-on-message', (payload: { message?: string; sender: { name: string }; timestamp: number }) => {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `${payload.timestamp}-${prev.length}`,
              senderName: payload.sender.name,
              message: payload.message ?? '',
              timestamp: payload.timestamp,
              isSelf: false,
            },
          ]);
        });

        await client.join(access.sessionName, access.signature, access.userIdentity);

        const currentUser = client.getCurrentUserInfo();
        const stream = client.getMediaStream();

        await stream.startAudio();
        setIsMicOn(true);

        await stream.startVideo();
        setIsCameraOn(true);

        const selfPlayerContainer = resetPlayerContainer(selfVideoContainer);
        const selfVideoElement = await stream.attachVideo(currentUser.userId, VIDEO_QUALITY_720P);
        if (selfVideoElement instanceof HTMLElement) {
          selfPlayerContainer.appendChild(selfVideoElement);
        }

        setIsJoined(true);
      } catch (err) {
        console.error('Failed to join live session room', err);
        setErrorMessage(err instanceof Error ? err.message : 'Failed to join the room');
      } finally {
        setIsJoining(false);
      }
    },
    [renderPeerVideo]
  );

  const leave = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      await client.leave();
    } catch (err) {
      console.error('Failed to leave live session room', err);
    } finally {
      clientRef.current = null;
      setIsJoined(false);
      setIsMicOn(false);
      setIsCameraOn(false);
      setIsScreenSharing(false);
      setIsReceivingScreenShare(false);
    }
  }, []);

  const toggleMic = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const stream = client.getMediaStream();
    if (isMicOn) {
      await stream.muteAudio();
    } else {
      await stream.unmuteAudio();
    }
    setIsMicOn((prev) => !prev);
  }, [isMicOn]);

  const toggleCamera = useCallback(async () => {
    const client = clientRef.current;
    const wrapper = selfWrapperRef.current;
    if (!client || !wrapper) return;
    const stream = client.getMediaStream();
    const currentUser = client.getCurrentUserInfo();
    if (isCameraOn) {
      await stream.stopVideo();
      wrapper.replaceChildren();
    } else {
      await stream.startVideo();
      const playerContainer = resetPlayerContainer(wrapper);
      const videoElement = await stream.attachVideo(currentUser.userId, VIDEO_QUALITY_720P);
      if (videoElement instanceof HTMLElement) {
        playerContainer.appendChild(videoElement);
      }
    }
    setIsCameraOn((prev) => !prev);
  }, [isCameraOn]);

  const toggleScreenShare = useCallback(
    async (shareCanvas: HTMLCanvasElement) => {
      const client = clientRef.current;
      if (!client) return;
      const stream = client.getMediaStream();
      if (isScreenSharing) {
        await stream.stopShareScreen();
      } else {
        await stream.startShareScreen(shareCanvas);
      }
      setIsScreenSharing((prev) => !prev);
    },
    [isScreenSharing]
  );

  const sendChatMessage = useCallback(async (text: string) => {
    const client = clientRef.current;
    const trimmed = text.trim();
    if (!client || !trimmed) return;
    const chatClient = client.getChatClient();
    await chatClient.sendToAll(trimmed);
    setChatMessages((prev) => [
      ...prev,
      { id: `self-${Date.now()}-${prev.length}`, senderName: selfIdentityRef.current, message: trimmed, timestamp: Date.now(), isSelf: true },
    ]);
  }, []);

  return {
    isJoined,
    isJoining,
    isMicOn,
    isCameraOn,
    isScreenSharing,
    isReceivingScreenShare,
    chatMessages,
    errorMessage,
    join,
    leave,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    registerShareViewContainer,
    sendChatMessage,
  };
}
