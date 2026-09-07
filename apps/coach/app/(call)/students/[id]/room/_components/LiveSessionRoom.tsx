'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Maximize2,
  MessageSquare,
  MessageSquareOff,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Send,
  Sparkles,
  TimerReset,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { useZoomVideoSession } from '@gabby/lib/zoom/hooks/useZoomVideoSession';
import { useZoomDevicePreview } from '@gabby/lib/zoom/hooks/useZoomDevicePreview';
import { useLiveSessionPresence } from '@gabby/lib/liveSessionRoom/hooks/useLiveSessionPresence';
import { LIVE_SESSION_WARNING_AFTER_MS, LIVE_SESSION_END_AFTER_MS } from '@gabby/lib/liveSessionRoom/constants';
import { useFullscreen } from '@gabby/lib/hooks/useFullscreen';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { UserAvatar } from '@/components/common/UserAvatar';
import type { LiveSessionRoomAccess } from '@gabby/types/liveSessionRoom';

interface Props {
  access: LiveSessionRoomAccess;
}

type RoomPhase = 'preview' | 'in-call' | 'ended';
type LockStatus = 'checking' | 'granted' | 'denied';

// コーチにつき同時に1つのライブセッションタブしか開けないようにするための排他ロック名
// （生徒A/生徒Bを問わず、コーチアカウント単位で共有する）
const COACH_LIVE_SESSION_LOCK_NAME = 'gabby-coach-live-session-room';

export function LiveSessionRoom({ access }: Props) {
  const preview = useZoomDevicePreview();
  const {
    isJoined,
    isJoining,
    isMicOn,
    isCameraOn,
    isBlurOn,
    isBlurSupported,
    isPeerConnected,
    isScreenSharing,
    chatMessages,
    errorMessage,
    join,
    leave,
    toggleMic,
    toggleCamera,
    toggleBlur,
    toggleScreenShare,
    sendChatMessage,
  } = useZoomVideoSession();
  const { isStudentPresent, trackSelf, untrackSelf } = useLiveSessionPresence(access.sessionName);

  const [phase, setPhase] = useState<RoomPhase>('preview');
  const [isTimeWarningVisible, setIsTimeWarningVisible] = useState(false);
  const [wasTimeLimitReached, setWasTimeLimitReached] = useState(false);
  const sessionStartRequested = useRef(false);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSelfViewVisible, setIsSelfViewVisible] = useState(true);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const selfVideoRef = useRef<HTMLDivElement>(null);
  const peerVideoRef = useRef<HTMLDivElement>(null);
  const shareVideoRef = useRef<HTMLVideoElement>(null);
  const roomContainerRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');
  const previewRequested = useRef(false);
  const joinRequested = useRef(false);
  const initialDeviceStateRef = useRef({ micOn: true, cameraOn: true, blurOn: false });
  const { isFullscreen, toggleFullscreen } = useFullscreen(roomContainerRef);
  const { showConfirm } = useConfirm();

  const [lockStatus, setLockStatus] = useState<LockStatus>('checking');
  const [lockRetryToken, setLockRetryToken] = useState(0);
  const releaseLockRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!('locks' in navigator)) {
      setLockStatus('granted');
      return;
    }

    let cancelled = false;
    navigator.locks.request(COACH_LIVE_SESSION_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, (lock) => {
      if (!lock) {
        if (!cancelled) setLockStatus('denied');
        return;
      }
      if (!cancelled) setLockStatus('granted');
      // タブを閉じる/退室するまでロックを保持し続けるため、外部から解放できるPromiseを返す
      return new Promise<void>((resolve) => {
        releaseLockRef.current = resolve;
      });
    });

    return () => {
      cancelled = true;
      releaseLockRef.current?.();
      releaseLockRef.current = null;
    };
  }, [lockRetryToken]);

  useEffect(() => {
    // lockStatusが'checking'の間はプレビュー画面自体がマウントされずcanvasが存在しないため、
    // 'granted'に変わって実際にプレビューJSXがマウントされたタイミングでも再実行されるようdepsに含める
    if (lockStatus !== 'granted' || phase !== 'preview' || previewRequested.current || !previewCanvasRef.current) return;
    previewRequested.current = true;
    preview.startPreview(previewCanvasRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lockStatus]);

  useEffect(() => {
    if (phase !== 'in-call' || joinRequested.current) return;
    if (!selfVideoRef.current || !peerVideoRef.current) return;
    joinRequested.current = true;
    join(access, selfVideoRef.current, peerVideoRef.current, {
      initialMicOn: initialDeviceStateRef.current.micOn,
      initialCameraOn: initialDeviceStateRef.current.cameraOn,
      initialBlurOn: initialDeviceStateRef.current.blurOn,
    });
  }, [phase, access, join]);

  // 自分（コーチ）の在室状態を、生徒側から見える形でRealtime Presenceに反映する
  useEffect(() => {
    if (!isJoined) return;
    trackSelf('coach');
  }, [isJoined, trackSelf]);

  const clearSessionTimers = () => {
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (endTimeoutRef.current) clearTimeout(endTimeoutRef.current);
    warningTimeoutRef.current = null;
    endTimeoutRef.current = null;
  };

  // 生徒の入室（＝実質的なレッスン開始）を検知したタイミングを起点に、残り時間の警告と自動終了を仕込む
  useEffect(() => {
    if (!isJoined || !isStudentPresent || sessionStartRequested.current) return;
    sessionStartRequested.current = true;

    warningTimeoutRef.current = setTimeout(() => {
      setIsTimeWarningVisible(true);
    }, LIVE_SESSION_WARNING_AFTER_MS);

    endTimeoutRef.current = setTimeout(() => {
      handleTimeLimitReached();
    }, LIVE_SESSION_END_AFTER_MS);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJoined, isStudentPresent]);

  useEffect(() => {
    return () => {
      preview.stopPreview();
      clearSessionTimers();
      untrackSelf();
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartCall = async () => {
    initialDeviceStateRef.current = { micOn: preview.isMicOn, cameraOn: preview.isCameraOn, blurOn: preview.isBlurOn };
    await preview.stopPreview();
    setPhase('in-call');
  };

  // 30分の制限時間に達した場合、コーチ側から全員（自分＋生徒）を強制的に退出させる
  const handleTimeLimitReached = async () => {
    clearSessionTimers();
    await untrackSelf();
    await leave(true);
    releaseLockRef.current?.();
    releaseLockRef.current = null;
    setWasTimeLimitReached(true);
    setPhase('ended');
  };

  const handleLeave = async () => {
    // ネイティブ全画面表示中は確認ダイアログがフルスクリーン要素の外側に描画され不可視になるため、先に解除する
    if (isFullscreen) {
      await toggleFullscreen();
    }

    const confirmed = await showConfirm(
      'End live session?',
      'This will disconnect the call for both you and the student. This cannot be undone.',
      { variant: 'danger', isModal: false, confirmText: 'End Session', cancelText: 'Cancel' }
    );
    if (!confirmed) return;

    clearSessionTimers();
    await untrackSelf();
    await leave(true);
    // 通話終了時点でロックを解放し、他のタブから新しいセッションを開始できるようにする
    // （このタブ自体は「閉じてください」の案内画面のまま残るため、ここではまだ遷移しない）
    releaseLockRef.current?.();
    releaseLockRef.current = null;
    setPhase('ended');
  };

  const handleRetryLockCheck = () => {
    setLockStatus('checking');
    setLockRetryToken((prev) => prev + 1);
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
    setChatInput('');
  };

  if (lockStatus === 'checking') {
    return <div className="h-full w-full bg-white" />;
  }

  if (lockStatus === 'denied') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center bg-white">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 border border-rose-100">
          <Lock size={22} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-900">Live session already open</p>
          <p className="text-xs text-slate-500 max-w-xs">
            You already have a live session open in another tab. Please close that tab before starting a new one.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors px-3.5 py-2 rounded-full border border-slate-200 hover:bg-slate-50"
          >
            <X size={14} />
            Close Tab
          </button>
          <button
            onClick={handleRetryLockCheck}
            className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-3.5 py-2 rounded-full"
          >
            I closed the other tab — Retry
          </button>
        </div>
        <p className="text-[10px] text-slate-400 max-w-xs">
          If the tab doesn&apos;t close automatically, you can close it manually.
        </p>
      </div>
    );
  }

  if (phase === 'ended') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center bg-white">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 border border-emerald-100">
          <CheckCircle2 size={22} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-900">Session ended</p>
          <p className="text-xs text-slate-500">
            {wasTimeLimitReached
              ? 'The 30-minute session time limit was reached, so the call was ended automatically. You can close this tab now.'
              : 'You can close this tab now.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2 rounded-full"
          >
            <X size={14} />
            Close Tab
          </button>
        </div>
        <p className="text-[10px] text-slate-400 max-w-xs">
          If the tab doesn&apos;t close automatically, you can close it manually.
        </p>
      </div>
    );
  }

  if (phase === 'preview') {
    return (
      <div className="h-full w-full flex items-center justify-center p-2 sm:p-4">
        <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="shrink-0 px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <button
              onClick={() => window.close()}
              title="Close tab"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
            <div>
              <p className="text-sm font-bold text-slate-900">Session with {access.peerName}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Check your camera and microphone before joining</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center bg-slate-50/50 p-5 gap-4">
            <div className="w-full max-w-md flex flex-col items-center gap-4">
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-900 shadow-sm">
              <canvas ref={previewCanvasRef} className="w-full h-full object-cover" />
              {!preview.isCameraOn && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                  <VideoOff size={28} />
                </div>
              )}
            </div>

            <div className="w-full flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-100"
                  style={{ width: `${Math.min(100, preview.micVolume)}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-slate-400 shrink-0">Mic level</span>
            </div>

            {preview.errorMessage && (
              <div className="text-center">
                <p className="text-xs font-semibold text-rose-600">
                  Failed to access camera/microphone. Please check your browser permissions.
                </p>
                <p className="text-[10px] text-rose-400 mt-0.5">{preview.errorMessage}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={preview.toggleMic}
                disabled={!preview.isPreviewing}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${preview.isMicOn ? 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm' : 'bg-rose-500 text-white hover:bg-rose-600'}`}
              >
                {preview.isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
              <button
                onClick={() => previewCanvasRef.current && preview.toggleCamera(previewCanvasRef.current)}
                disabled={!preview.isPreviewing}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${preview.isCameraOn ? 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm' : 'bg-rose-500 text-white hover:bg-rose-600'}`}
              >
                {preview.isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
              <button
                onClick={() => previewCanvasRef.current && preview.toggleBlur(previewCanvasRef.current)}
                disabled={!preview.isPreviewing || !preview.isCameraOn}
                title="Blur background"
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${preview.isBlurOn ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}
              >
                <Sparkles size={18} />
              </button>
            </div>
            </div>
          </div>

          <div className="shrink-0 px-5 py-4 border-t border-slate-100 bg-white">
            <button
              onClick={handleStartCall}
              disabled={!preview.isPreviewing}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/10 transition-all"
            >
              Join Session
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={roomContainerRef}
      className={`flex flex-col bg-slate-950 overflow-hidden ${isFullscreen ? 'h-screen w-screen' : 'h-full w-full'}`}
    >
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <UserAvatar userName={access.peerName} iconPath={access.peerIconPath} size={32} />
          <div>
            <p className="text-sm font-bold text-white leading-tight">{access.peerName}</p>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {isJoined ? 'Live Session in progress' : isJoining ? 'Connecting...' : 'Not connected'}
            </p>
          </div>
        </div>
        <button
          onClick={toggleFullscreen}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {errorMessage && (
        <div className="px-5 py-2 bg-red-500/10 text-red-300 text-xs font-semibold border-b border-red-500/20">
          {errorMessage}
        </div>
      )}

      {isTimeWarningVisible && (
        <div className="flex items-center gap-2 px-5 py-2 bg-amber-500/10 text-amber-300 text-xs font-semibold border-b border-amber-500/20">
          <TimerReset size={14} />
          5 minutes remaining — this session will end automatically at the 30-minute mark.
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* 映像そのものが映るキャンバス部分。ZoomやMeet同様、余白・角丸なしで画面端まで敷き詰める */}
        <div className="flex-1 relative min-h-0 overflow-hidden bg-black">
          {/* 相手をメインとしてペイン全体に表示（object-coverで隙間なく埋める） */}
          <div
            ref={peerVideoRef}
            className="absolute inset-0 [&_video-player-container]:w-full [&_video-player-container]:h-full [&_video-player]:w-full [&_video-player]:h-full [&_video-player]:object-cover"
          />
          <span className="absolute bottom-3 left-3 text-xs font-bold text-white/80 bg-black/40 px-2.5 py-1 rounded-md">
            {access.peerName}
          </span>

          {/* 相手がまだ入室していない間の待機表示 */}
          {isJoined && !isPeerConnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <UserAvatar userName={access.peerName} iconPath={access.peerIconPath} size={56} />
              <p className="text-xs font-semibold text-slate-400">Waiting for {access.peerName} to join...</p>
            </div>
          )}

          {/* 自分はワイプとして右上に小さく重ねる */}
          <div
            className={`absolute top-3 right-3 w-28 sm:w-36 aspect-video rounded-lg overflow-hidden border-2 border-white/20 shadow-lg bg-slate-900 z-10 ${isSelfViewVisible ? '' : 'hidden'}`}
          >
            <div
              ref={selfVideoRef}
              className="w-full h-full [&_video-player-container]:w-full [&_video-player-container]:h-full [&_video-player]:w-full [&_video-player]:h-full [&_video-player]:object-cover"
            />
          </div>
        </div>
        {/* 画面共有の送信元canvas（自分がシェアする内容の描画先。表示はしないため自分カメラ非表示トグルの影響を受けない位置に置く） */}
        <video ref={shareVideoRef} className="hidden" muted playsInline />

        {isChatVisible && (
          <div className="hidden lg:flex w-72 flex-col border-l border-slate-800 bg-slate-900/60">
            <div className="px-4 py-2.5 border-b border-slate-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">In-call Chat</p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {chatMessages.length === 0 ? (
                <p className="text-xs text-slate-500 text-center mt-6">No messages yet</p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className={`text-xs ${msg.isSelf ? 'text-right' : 'text-left'}`}>
                    <p className="font-bold text-slate-400 text-[10px]">{msg.senderName}</p>
                    <p className={`inline-block mt-0.5 px-2.5 py-1.5 rounded-lg ${msg.isSelf ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
                      {msg.message}
                    </p>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-slate-800 flex items-center gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="Type a message..."
                className="flex-1 text-xs bg-slate-800 text-white placeholder:text-slate-500 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={handleSendChat}
                className="shrink-0 w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-center gap-3 px-5 py-4 bg-slate-900/80 border-t border-slate-800">
        <button
          onClick={toggleMic}
          disabled={!isJoined}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${isMicOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-rose-500 hover:bg-rose-600 text-white'}`}
        >
          {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          onClick={toggleCamera}
          disabled={!isJoined}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${isCameraOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-rose-500 hover:bg-rose-600 text-white'}`}
        >
          {isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button
          onClick={() => setIsSelfViewVisible((prev) => !prev)}
          disabled={!isJoined}
          title={isSelfViewVisible ? 'Hide self view' : 'Show self view'}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 bg-slate-700 hover:bg-slate-600 text-white"
        >
          {isSelfViewVisible ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
        <button
          onClick={() => setIsChatVisible((prev) => !prev)}
          disabled={!isJoined}
          title={isChatVisible ? 'Hide chat' : 'Show chat'}
          className="hidden lg:flex w-11 h-11 rounded-full items-center justify-center transition-colors disabled:opacity-40 bg-slate-700 hover:bg-slate-600 text-white"
        >
          {isChatVisible ? <MessageSquare size={18} /> : <MessageSquareOff size={18} />}
        </button>
        <button
          onClick={toggleBlur}
          disabled={!isJoined || !isCameraOn || !isBlurSupported}
          title={isBlurSupported ? 'Blur background' : 'Background blur is not supported on this device'}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${isBlurOn ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
        >
          <Sparkles size={18} />
        </button>
        <button
          onClick={() => shareVideoRef.current && toggleScreenShare(shareVideoRef.current)}
          disabled={!isJoined}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${isScreenSharing ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
        >
          {isScreenSharing ? <MonitorX size={18} /> : <MonitorUp size={18} />}
        </button>
        <button
          onClick={handleLeave}
          className="w-11 h-11 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-colors ml-2"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}
