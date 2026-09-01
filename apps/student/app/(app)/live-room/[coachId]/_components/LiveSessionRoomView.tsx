'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronLeft,
  Eye,
  EyeOff,
  Maximize2,
  MessageSquare,
  MessageSquareOff,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  Send,
  Sparkles,
  User,
  Video,
  VideoOff,
} from 'lucide-react';
import { useZoomVideoSession } from '@gabby/lib/zoom/hooks/useZoomVideoSession';
import { useZoomDevicePreview } from '@gabby/lib/zoom/hooks/useZoomDevicePreview';
import { useFullscreen } from '@gabby/lib/hooks/useFullscreen';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import type { LiveSessionRoomAccess } from '@gabby/types/liveSessionRoom';

interface Props {
  access: LiveSessionRoomAccess;
}

type RoomPhase = 'preview' | 'in-call';

export function LiveSessionRoomView({ access }: Props) {
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
    isReceivingScreenShare,
    chatMessages,
    errorMessage,
    join,
    leave,
    toggleMic,
    toggleCamera,
    toggleBlur,
    registerShareViewContainer,
    sendChatMessage,
  } = useZoomVideoSession();

  const [phase, setPhase] = useState<RoomPhase>('preview');
  const [isSelfViewVisible, setIsSelfViewVisible] = useState(true);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const selfVideoRef = useRef<HTMLDivElement>(null);
  const peerVideoRef = useRef<HTMLDivElement>(null);
  const shareViewRef = useRef<HTMLDivElement>(null);
  const roomContainerRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');
  const previewRequested = useRef(false);
  const joinRequested = useRef(false);
  const initialDeviceStateRef = useRef({ micOn: true, cameraOn: true, blurOn: false });
  const peerIconUrl = getProfileIconUrl(access.peerIconPath);
  const { isFullscreen, toggleFullscreen } = useFullscreen(roomContainerRef);
  const { showConfirm } = useConfirm();

  useEffect(() => {
    if (phase !== 'preview' || previewRequested.current || !previewCanvasRef.current) return;
    previewRequested.current = true;
    preview.startPreview(previewCanvasRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== 'in-call' || joinRequested.current) return;
    // shareViewRefはin-callフェーズのJSXでのみマウントされるため、preview中に登録すると
    // nullのまま固定されてしまう。in-callへの切り替え後、ここで確実に登録する。
    if (!selfVideoRef.current || !peerVideoRef.current || !shareViewRef.current) return;
    joinRequested.current = true;
    registerShareViewContainer(shareViewRef.current);
    join(access, selfVideoRef.current, peerVideoRef.current, {
      initialMicOn: initialDeviceStateRef.current.micOn,
      initialCameraOn: initialDeviceStateRef.current.cameraOn,
      initialBlurOn: initialDeviceStateRef.current.blurOn,
    });
  }, [phase, access, join, registerShareViewContainer]);

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
    // ネイティブ全画面表示中は確認ダイアログがフルスクリーン要素の外側に描画され不可視になるため、先に解除する
    if (isFullscreen) {
      await toggleFullscreen();
    }

    const confirmed = await showConfirm(
      'レッスンを終了しますか？',
      '通話が終了し、退室します。この操作は取り消せません。',
      { variant: 'danger', isModal: false, confirmText: '退室する' }
    );
    if (!confirmed) return;

    await leave();
    router.push('/dashboard');
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
    setChatInput('');
  };

  if (phase === 'preview') {
    return (
      <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
        <header className="shrink-0 px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/live-room"
              className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400 shrink-0"
            >
              <ChevronLeft size={24} />
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
              {access.peerName} コーチとのレッスン
            </h1>
          </div>

          <p className="text-[13px] text-slate-500">カメラとマイクを確認してから参加してください。</p>
        </header>

        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center bg-slate-50/50 p-5 sm:p-8 gap-4">
          <div className="w-full max-w-md mx-auto flex flex-col items-center gap-4">
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
                className="h-full bg-rose-500 transition-all duration-100"
                style={{ width: `${Math.min(100, preview.micVolume)}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-slate-400 shrink-0">マイク入力</span>
          </div>

          {preview.errorMessage && (
            <div className="text-center">
              <p className="text-xs font-semibold text-rose-500">
                カメラ・マイクへのアクセスに失敗しました。ブラウザの権限設定をご確認ください。
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
              title="背景をぼかす"
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${preview.isBlurOn ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}
            >
              <Sparkles size={18} />
            </button>
          </div>
          </div>
        </div>

        <div className="px-5 py-4 sm:py-5 border-t border-slate-100 shrink-0 bg-white">
          <button
            onClick={handleStartCall}
            disabled={!preview.isPreviewing}
            className="w-full h-12 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-rose-600/10 transition-all active:scale-95"
          >
            レッスンに参加する
            <ArrowRight size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={roomContainerRef}
      className="fixed inset-0 z-40 flex flex-col bg-slate-950 overflow-hidden"
    >
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-slate-900/80 border-b border-slate-800">
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
        <button
          onClick={toggleFullscreen}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={isFullscreen ? '全画面を終了' : '全画面表示'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {errorMessage && (
        <div className="px-5 py-2 bg-rose-500/10 text-rose-300 text-xs font-semibold border-b border-rose-500/20">
          {errorMessage}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          {/* 映像そのものが映るキャンバス部分。ZoomやMeet同様、余白・角丸なしで画面端まで敷き詰める */}
          <div className="flex-1 relative min-h-0 overflow-hidden bg-black">
            {/* 画面共有: 常に同一DOMノードを維持し、共有中のみメイン表示にする
                （表示切替のたびに要素が入れ替わるとhook側のコンテナ参照が古いノードを指したままになるため） */}
            <div
              ref={shareViewRef}
              className={`absolute inset-0 [&_video-player-container]:w-full [&_video-player-container]:h-full [&_video-player]:w-full [&_video-player]:h-full ${isReceivingScreenShare ? '' : 'hidden'}`}
            />

            {/* 相手カメラ: 通常時はメイン全面、画面共有中は共有画面に集中させるため非表示にする */}
            <div className={isReceivingScreenShare ? 'hidden' : 'absolute inset-0'}>
              <div
                ref={peerVideoRef}
                className="w-full h-full [&_video-player-container]:w-full [&_video-player-container]:h-full [&_video-player]:w-full [&_video-player]:h-full [&_video-player]:object-cover"
              />
              {!isReceivingScreenShare && (
                <span className="absolute bottom-3 left-3 text-xs font-bold text-white/80 bg-black/40 px-2.5 py-1 rounded-md">
                  {access.peerName}
                </span>
              )}

              {/* 相手がまだ入室していない間の待機表示 */}
              {isJoined && !isPeerConnected && !isReceivingScreenShare && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                  <div className="w-14 h-14 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center text-slate-400 shrink-0">
                    {peerIconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={peerIconUrl} alt={access.peerName} className="w-full h-full object-cover" />
                    ) : (
                      <User size={24} />
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-400">{access.peerName}コーチの入室をお待ちしています</p>
                </div>
              )}
            </div>

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

          {/* モバイル(lg未満)ではPC向けサイドパネルの余地が無いため、映像の下にチャットを表示する */}
          {isChatVisible && (
            <div className="lg:hidden max-h-40 flex flex-col bg-slate-900/60 border-t border-slate-800 overflow-hidden shrink-0">
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
              <div className="p-2 border-t border-slate-800 flex items-center gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="メッセージを入力..."
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

        {/* デスクトップ(lg以上)では映像の右側にチャットパネルを常設する */}
        {isChatVisible && (
          <div className="hidden lg:flex w-72 flex-col border-l border-slate-800 bg-slate-900/60 shrink-0">
            <div className="px-4 py-2.5 border-b border-slate-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">チャット</p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {chatMessages.length === 0 ? (
                <p className="text-xs text-slate-500 text-center mt-6">まだメッセージはありません</p>
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
                placeholder="メッセージを入力..."
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
          title={isSelfViewVisible ? '自分の映像を非表示' : '自分の映像を表示'}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 bg-slate-700 hover:bg-slate-600 text-white"
        >
          {isSelfViewVisible ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
        <button
          onClick={() => setIsChatVisible((prev) => !prev)}
          disabled={!isJoined}
          title={isChatVisible ? 'チャットを非表示' : 'チャットを表示'}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 bg-slate-700 hover:bg-slate-600 text-white"
        >
          {isChatVisible ? <MessageSquare size={18} /> : <MessageSquareOff size={18} />}
        </button>
        <button
          onClick={toggleBlur}
          disabled={!isJoined || !isCameraOn || !isBlurSupported}
          title={isBlurSupported ? '背景をぼかす' : 'この端末では背景ぼかしを利用できません'}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${isBlurOn ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
        >
          <Sparkles size={18} />
        </button>
        <button
          onClick={handleLeave}
          className="w-11 h-11 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition-colors ml-2"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}
