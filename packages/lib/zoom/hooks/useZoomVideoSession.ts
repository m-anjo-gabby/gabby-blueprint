'use client';

// NOTE: 実装前に @zoom/videosdk 2.5.0 の型定義（node_modules/@zoom/videosdk/dist/types/*.d.ts）で
// 下記API（attachVideo/attachShareView, video-player-container要件, イベント名等）を実際に確認済み。
// メジャーバージョンを上げる際は再度突き合わせること。
import { useCallback, useRef, useState } from 'react';
import { ensureZoomClientInitialized } from '../client';
import { describeZoomError } from '../errors';
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
  isBlurOn: boolean;
  /** 現在の環境で背景ぼかしが利用可能か（isJoinedになるまではfalse） */
  isBlurSupported: boolean;
  /** 相手が現在セッションに入室済みか（自分1人だけの場合はfalse） */
  isPeerConnected: boolean;
  isScreenSharing: boolean;
  isReceivingScreenShare: boolean;
  /** ホスト（コーチ）によってセッションが終了させられたか（時間切れの強制終了等）。leave/次のjoinでリセットされる */
  wasEndedByHost: boolean;
  chatMessages: LiveSessionChatMessage[];
  errorMessage: string | null;
  /**
   * selfVideoContainer/peerVideoContainerは通常の<div>でよい（内部でvideo-player-containerを生成し格納する）。
   * initialMicOn/initialCameraOn/initialBlurOnは入室前プレビュー画面での選択を引き継ぐためのもの（省略時はマイク/カメラON、ぼかしOFF）。
   */
  join: (
    access: LiveSessionRoomAccess,
    selfVideoContainer: HTMLElement,
    peerVideoContainer: HTMLElement,
    options?: { initialMicOn?: boolean; initialCameraOn?: boolean; initialBlurOn?: boolean }
  ) => Promise<void>;
  /** end=trueを渡すと、ホスト（コーチ）権限で全参加者を退出させてセッションを終了する */
  leave: (end?: boolean) => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleBlur: () => Promise<void>;
  /**
   * 画面共有の開始/停止（コーチ側のみ使用）。送信側の描画先はvideo要素を渡すこと
   * （WebCodecs有効なブラウザではcanvas要素だと"INVALID_PARAMETERS"で失敗するため）。
   */
  toggleScreenShare: (shareVideoElement: HTMLVideoElement) => Promise<void>;
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
  const selfUserIdRef = useRef<number | null>(null);

  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isBlurOn, setIsBlurOn] = useState(false);
  const [isBlurSupported, setIsBlurSupported] = useState(false);
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isReceivingScreenShare, setIsReceivingScreenShare] = useState(false);
  const [wasEndedByHost, setWasEndedByHost] = useState(false);
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
    async (
      access: LiveSessionRoomAccess,
      selfVideoContainer: HTMLElement,
      peerVideoContainer: HTMLElement,
      options?: { initialMicOn?: boolean; initialCameraOn?: boolean; initialBlurOn?: boolean }
    ) => {
      const initialMicOn = options?.initialMicOn ?? true;
      const initialCameraOn = options?.initialCameraOn ?? true;
      const initialBlurOn = options?.initialBlurOn ?? false;
      setIsJoining(true);
      setErrorMessage(null);
      setWasEndedByHost(false);
      selfWrapperRef.current = selfVideoContainer;
      peerWrapperRef.current = peerVideoContainer;

      try {
        // プレビュー画面で既にclient.init()済みの場合はそれを再利用し、二重初期化を避ける
        const client = await ensureZoomClientInitialized();
        clientRef.current = client;

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

        const updatePeerConnected = () => {
          setIsPeerConnected((client.getAllUser()?.length ?? 1) > 1);
        };
        client.on('user-added', updatePeerConnected);
        client.on('user-removed', updatePeerConnected);

        // ブラウザのネイティブ「共有を停止」バーから終了された場合など、
        // こちらのAPI呼び出しを経ずに共有が止まるケースをここで拾ってisScreenSharingを追従させる
        client.on('passively-stop-share', () => {
          setIsScreenSharing(false);
        });

        // 時間切れ等でホスト（コーチ）がclient.leave(true)を呼んだ場合、参加者側はこのイベントで
        // reason: 'ended by host' を受け取る。UI側で専用の終了画面へ遷移させるためのフラグを立てる
        client.on('connection-change', (payload: { state: string; reason?: string }) => {
          if (payload.state === 'Closed' && payload.reason === 'ended by host') {
            setWasEndedByHost(true);
          }
        });

        client.on('chat-on-message', (payload: { message?: string; sender: { name: string; userId: number }; timestamp: number }) => {
          // chat-on-messageは送信者自身にもエコーされるため、sendChatMessage側では楽観的な追加を行わず、
          // このイベントを唯一の情報源としてuserIdの一致でisSelfを判定する（二重表示防止）
          setChatMessages((prev) => [
            ...prev,
            {
              id: `${payload.timestamp}-${prev.length}`,
              senderName: payload.sender.name,
              message: payload.message ?? '',
              timestamp: payload.timestamp,
              isSelf: payload.sender.userId === selfUserIdRef.current,
            },
          ]);
        });

        await client.join(access.sessionName, access.signature, access.userIdentity);

        // 'user-added'は自分の入室後に相手が入ってきた場合のみ発火するため、
        // 相手が自分より先に入室済みだったケースをここで拾う
        setIsPeerConnected((client.getAllUser()?.length ?? 1) > 1);

        const currentUser = client.getCurrentUserInfo();
        selfUserIdRef.current = currentUser.userId;
        const stream = client.getMediaStream();

        setIsBlurSupported(stream.isSupportVirtualBackground());

        await stream.startAudio();
        if (!initialMicOn) {
          await stream.muteAudio();
        }
        setIsMicOn(initialMicOn);

        if (initialCameraOn) {
          // 画質は課金（セッション分数課金のみで解像度による差はない）に影響しないため、常にHDで送信する
          await stream.startVideo({ hd: true, ...(initialBlurOn ? { virtualBackground: { imageUrl: 'blur' } } : {}) });
          const selfPlayerContainer = resetPlayerContainer(selfVideoContainer);
          const selfVideoElement = await stream.attachVideo(currentUser.userId, VIDEO_QUALITY_720P);
          if (selfVideoElement instanceof HTMLElement) {
            selfPlayerContainer.appendChild(selfVideoElement);
          }
          setIsBlurOn(initialBlurOn);
        }
        setIsCameraOn(initialCameraOn);

        setIsJoined(true);
      } catch (err) {
        const { detail, message } = describeZoomError(err);
        console.error('Failed to join live session room:', message, detail);
        setErrorMessage(message);
      } finally {
        setIsJoining(false);
      }
    },
    [renderPeerVideo]
  );

  const leave = useCallback(async (end?: boolean) => {
    const client = clientRef.current;
    if (!client) return;
    try {
      await client.leave(end);
    } catch (err) {
      const { detail, message } = describeZoomError(err);
      console.error('Failed to leave live session room:', message, detail);
    } finally {
      clientRef.current = null;
      setIsJoined(false);
      setIsMicOn(false);
      setIsCameraOn(false);
      setIsBlurOn(false);
      setIsBlurSupported(false);
      setIsPeerConnected(false);
      setIsScreenSharing(false);
      setIsReceivingScreenShare(false);
    }
  }, []);

  const toggleMic = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const stream = client.getMediaStream();
    try {
      if (isMicOn) {
        await stream.muteAudio();
      } else {
        await stream.unmuteAudio();
      }
      setIsMicOn((prev) => !prev);
    } catch (err) {
      const { detail, message } = describeZoomError(err);
      console.error('Failed to toggle microphone:', message, detail);
      setErrorMessage(message);
    }
  }, [isMicOn]);

  const toggleCamera = useCallback(async () => {
    const client = clientRef.current;
    const wrapper = selfWrapperRef.current;
    if (!client || !wrapper) return;
    const stream = client.getMediaStream();
    const currentUser = client.getCurrentUserInfo();
    try {
      if (isCameraOn) {
        await stream.stopVideo();
        wrapper.replaceChildren();
      } else {
        // ぼかし設定はカメラOFF/ON後も維持する。画質は課金に影響しないため常にHDで送信する
        await stream.startVideo({ hd: true, ...(isBlurOn ? { virtualBackground: { imageUrl: 'blur' } } : {}) });
        const playerContainer = resetPlayerContainer(wrapper);
        const videoElement = await stream.attachVideo(currentUser.userId, VIDEO_QUALITY_720P);
        if (videoElement instanceof HTMLElement) {
          playerContainer.appendChild(videoElement);
        }
      }
      setIsCameraOn((prev) => !prev);
    } catch (err) {
      const { detail, message } = describeZoomError(err);
      console.error('Failed to toggle camera:', message, detail);
      setErrorMessage(message);
    }
  }, [isCameraOn, isBlurOn]);

  const toggleBlur = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !isCameraOn) return;
    const stream = client.getMediaStream();
    try {
      const next = !isBlurOn;
      await stream.updateVirtualBackgroundImage(next ? 'blur' : undefined);
      setIsBlurOn(next);
    } catch (err) {
      const { detail, message } = describeZoomError(err);
      console.error('Failed to toggle background blur:', message, detail);
      setErrorMessage(message);
    }
  }, [isBlurOn, isCameraOn]);

  const toggleScreenShare = useCallback(
    async (shareVideoElement: HTMLVideoElement) => {
      const client = clientRef.current;
      if (!client) return;
      const stream = client.getMediaStream();
      try {
        if (isScreenSharing) {
          await stream.stopShareScreen();
        } else {
          await stream.startShareScreen(shareVideoElement);
        }
        setIsScreenSharing((prev) => !prev);
      } catch (err) {
        const { detail, message } = describeZoomError(err);
        console.error('Failed to toggle screen share:', message, detail);
        // 共有ダイアログでユーザーが「キャンセル」した場合は正常な操作なので、
        // エラーバナーは出さずログのみに留める
        const reason = (detail as { reason?: string } | null)?.reason ?? '';
        if (!reason.toLowerCase().includes('deny')) {
          setErrorMessage(message);
        }
      }
    },
    [isScreenSharing]
  );

  const sendChatMessage = useCallback(async (text: string) => {
    const client = clientRef.current;
    const trimmed = text.trim();
    if (!client || !trimmed) return;
    try {
      const chatClient = client.getChatClient();
      // 送信した内容は 'chat-on-message' が送信者自身にもエコーしてくるため、
      // ここで楽観的に追加すると二重表示になる。反映はそのイベント側に一本化する。
      await chatClient.sendToAll(trimmed);
    } catch (err) {
      const { detail, message } = describeZoomError(err);
      console.error('Failed to send chat message:', message, detail);
      setErrorMessage(message);
    }
  }, []);

  return {
    isJoined,
    isJoining,
    isMicOn,
    isCameraOn,
    isBlurOn,
    isBlurSupported,
    isPeerConnected,
    isScreenSharing,
    isReceivingScreenShare,
    wasEndedByHost,
    chatMessages,
    errorMessage,
    join,
    leave,
    toggleMic,
    toggleCamera,
    toggleBlur,
    toggleScreenShare,
    registerShareViewContainer,
    sendChatMessage,
  };
}
