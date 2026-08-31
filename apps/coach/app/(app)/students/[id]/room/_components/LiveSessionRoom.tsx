'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Send,
  Sparkles,
  Video,
  VideoOff,
} from 'lucide-react';
import { useZoomVideoSession } from '@gabby/lib/zoom/hooks/useZoomVideoSession';
import { useZoomDevicePreview } from '@gabby/lib/zoom/hooks/useZoomDevicePreview';
import { useFullscreen } from '@gabby/lib/hooks/useFullscreen';
import { UserAvatar } from '@/components/common/UserAvatar';
import type { LiveSessionRoomAccess } from '@gabby/types/liveSessionRoom';

interface Props {
  studentId: string;
  access: LiveSessionRoomAccess;
}

type RoomPhase = 'preview' | 'in-call';

export function LiveSessionRoom({ studentId, access }: Props) {
  const router = useRouter();
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

  const [phase, setPhase] = useState<RoomPhase>('preview');
  const [isSelfViewVisible, setIsSelfViewVisible] = useState(true);
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

  useEffect(() => {
    if (phase !== 'preview' || previewRequested.current || !previewCanvasRef.current) return;
    previewRequested.current = true;
    preview.startPreview(previewCanvasRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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

  useEffect(() => {
    return () => {
      preview.stopPreview();
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartCall = async () => {
    initialDeviceStateRef.current = { micOn: preview.isMicOn, cameraOn: preview.isCameraOn, blurOn: preview.isBlurOn };
    await preview.stopPreview();
    setPhase('in-call');
  };

  const handleLeave = async () => {
    await leave();
    router.push(`/students/${studentId}`);
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
    setChatInput('');
  };

  if (phase === 'preview') {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[600px] rounded-2xl border border-slate-200 bg-slate-900 overflow-hidden shadow-sm">
        <div className="shrink-0 px-5 py-4 border-b border-slate-800 flex items-center gap-3">
          <Link
            href={`/students/${studentId}`}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <p className="text-sm font-bold text-white">Session with {access.peerName}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Check your camera and microphone before joining</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-5 gap-4">
          <div className="w-full max-w-2xl flex flex-col items-center gap-4">
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-800">
            <canvas ref={previewCanvasRef} className="w-full h-full object-cover" />
            {!preview.isCameraOn && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                <VideoOff size={28} />
              </div>
            )}
          </div>

          <div className="w-full flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-100"
                style={{ width: `${Math.min(100, preview.micVolume)}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-slate-500 shrink-0">Mic level</span>
          </div>

          {preview.errorMessage && (
            <div className="text-center">
              <p className="text-xs font-semibold text-red-300">
                Failed to access camera/microphone. Please check your browser permissions.
              </p>
              <p className="text-[10px] text-red-400/70 mt-0.5">{preview.errorMessage}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={preview.toggleMic}
              disabled={!preview.isPreviewing}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${preview.isMicOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500/90 hover:bg-red-500 text-white'}`}
            >
              {preview.isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button
              onClick={() => previewCanvasRef.current && preview.toggleCamera(previewCanvasRef.current)}
              disabled={!preview.isPreviewing}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${preview.isCameraOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500/90 hover:bg-red-500 text-white'}`}
            >
              {preview.isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button
              onClick={() => previewCanvasRef.current && preview.toggleBlur(previewCanvasRef.current)}
              disabled={!preview.isPreviewing || !preview.isCameraOn}
              title="Blur background"
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${preview.isBlurOn ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
            >
              <Sparkles size={18} />
            </button>
          </div>
          </div>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-slate-800">
          <button
            onClick={handleStartCall}
            disabled={!preview.isPreviewing}
            className="w-full max-w-2xl mx-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-bold py-3 rounded-xl transition-colors"
          >
            Join Session
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={roomContainerRef}
      className={`flex flex-col bg-slate-900 overflow-hidden ${isFullscreen ? 'h-screen w-screen' : 'h-[calc(100vh-8rem)] min-h-[600px] rounded-2xl border border-slate-200 shadow-sm'}`}
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

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative min-h-0 m-3 rounded-xl overflow-hidden bg-slate-800">
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
      </div>

      <div className="shrink-0 flex items-center justify-center gap-3 px-5 py-4 bg-slate-900/80 border-t border-slate-800">
        <button
          onClick={toggleMic}
          disabled={!isJoined}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${isMicOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500/90 hover:bg-red-500 text-white'}`}
        >
          {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          onClick={toggleCamera}
          disabled={!isJoined}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${isCameraOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500/90 hover:bg-red-500 text-white'}`}
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
          className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors ml-2"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}
