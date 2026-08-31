'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, MicOff, PhoneOff, Send, User, Video, VideoOff } from 'lucide-react';
import { useZoomVideoSession } from '@gabby/lib/zoom/hooks/useZoomVideoSession';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import type { LiveSessionRoomAccess } from '@gabby/types/liveSessionRoom';

interface Props {
  access: LiveSessionRoomAccess;
}

export function LiveSessionRoomView({ access }: Props) {
  const router = useRouter();
  const {
    isJoined,
    isJoining,
    isMicOn,
    isCameraOn,
    isReceivingScreenShare,
    chatMessages,
    errorMessage,
    join,
    leave,
    toggleMic,
    toggleCamera,
    registerShareViewContainer,
    sendChatMessage,
  } = useZoomVideoSession();

  const selfVideoRef = useRef<HTMLDivElement>(null);
  const peerVideoRef = useRef<HTMLDivElement>(null);
  const shareViewRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');
  const joinRequested = useRef(false);
  const peerIconUrl = getProfileIconUrl(access.peerIconPath);

  useEffect(() => {
    if (joinRequested.current) return;
    if (!selfVideoRef.current || !peerVideoRef.current) return;
    joinRequested.current = true;
    join(access, selfVideoRef.current, peerVideoRef.current);
  }, [access, join]);

  useEffect(() => {
    registerShareViewContainer(shareViewRef.current);
    return () => {
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLeave = async () => {
    await leave();
    router.push('/dashboard');
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
    setChatInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[600px] w-full max-w-3xl mx-auto rounded-[32px] bg-slate-900 overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-5 py-3 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center text-slate-400 shrink-0">
            {peerIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={peerIconUrl} alt={access.peerName} className="w-full h-full object-cover" />
            ) : (
              <User size={16} />
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{access.peerName} コーチ</p>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {isJoined ? 'レッスン中' : isJoining ? '接続中...' : '未接続'}
            </p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="px-5 py-2 bg-red-500/10 text-red-300 text-xs font-semibold border-b border-red-500/20">
          {errorMessage}
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 p-3 gap-3">
        {/* 常に同一DOMノードを維持する（表示切替のたびに要素が入れ替わるとhook側のコンテナ参照が古いノードを指したままになるため） */}
        <div
          ref={shareViewRef}
          className={`rounded-xl overflow-hidden bg-slate-800 [&_video-player-container]:w-full [&_video-player-container]:h-full ${isReceivingScreenShare ? 'flex-1 min-h-[160px]' : 'hidden'}`}
        />
        <div className={`grid gap-3 ${isReceivingScreenShare ? 'grid-cols-2 h-28' : 'flex-1 grid-cols-1 sm:grid-cols-2'}`}>
          <div className="relative rounded-xl overflow-hidden bg-slate-800 min-h-[110px]">
            <div ref={peerVideoRef} className="w-full h-full [&_video-player-container]:w-full [&_video-player-container]:h-full" />
            <span className="absolute bottom-2 left-2 text-[10px] font-bold text-white/80 bg-black/40 px-2 py-0.5 rounded-md">
              {access.peerName}
            </span>
          </div>
          <div className="relative rounded-xl overflow-hidden bg-slate-800 min-h-[110px]">
            <div ref={selfVideoRef} className="w-full h-full [&_video-player-container]:w-full [&_video-player-container]:h-full" />
            <span className="absolute bottom-2 left-2 text-[10px] font-bold text-white/80 bg-black/40 px-2 py-0.5 rounded-md">
              自分
            </span>
          </div>
        </div>

        <div className="max-h-40 flex flex-col rounded-xl bg-slate-800/60 overflow-hidden shrink-0">
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {chatMessages.length === 0 ? (
              <p className="text-[11px] text-slate-500 text-center py-2">まだメッセージはありません</p>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className={`text-[11px] ${msg.isSelf ? 'text-right' : 'text-left'}`}>
                  <span className="font-bold text-slate-400 mr-1.5">{msg.senderName}</span>
                  <span className={`inline-block px-2 py-1 rounded-lg ${msg.isSelf ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-100'}`}>
                    {msg.message}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="p-2 border-t border-slate-700 flex items-center gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              placeholder="メッセージを入力..."
              className="flex-1 text-xs bg-slate-900 text-white placeholder:text-slate-500 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500"
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

      <div className="flex items-center justify-center gap-3 px-5 py-4 bg-slate-900/80 border-t border-slate-800">
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
          onClick={handleLeave}
          className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors ml-2"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}
