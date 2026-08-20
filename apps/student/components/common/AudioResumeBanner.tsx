'use client';

import React from 'react';
import { Volume2, RefreshCw } from 'lucide-react';

type AudioResumeStatus = 'ok' | 'needsResume' | 'failed';

interface AudioResumeBannerProps {
  status: AudioResumeStatus;
  onResume: () => void;
}

/**
 * iOSでバックグラウンド放置後にAudioContextが停止したままになった場合の通知UI。
 * - 'needsResume': 「タップして音声を再開」の軽い導線。タップ自体がユーザー操作の
 *   同期コールスタックとなり、AudioContextの再生成・再開を確実に行えるようにする。
 * - 'failed': 上記の再開操作を試しても回復しなかった状態。iOS側でページのJavaScript実行状態
 *   ごと破棄されている可能性が高く、このセッション内での復旧は見込めないため、
 *   はっきりと「再読み込みしてください」と案内する。
 */
export const AudioResumeBanner: React.FC<AudioResumeBannerProps> = ({ status, onResume }) => {
  if (status === 'ok') return null;

  if (status === 'failed') {
    return (
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center z-[130] p-6 animate-in fade-in duration-300">
        <div className="bg-white rounded-[28px] shadow-2xl p-6 max-w-xs w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-500">
            <Volume2 size={22} strokeWidth={2.5} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-black text-slate-800 tracking-tight">セッションが切断されました</h3>
            <p className="text-xs text-slate-500 leading-relaxed">音声の接続を復旧できませんでした。お手数ですが再読み込みしてください。</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
          >
            <RefreshCw size={14} strokeWidth={2.5} />
            <span>再読み込み</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-4 inset-x-0 flex justify-center z-[130] px-4 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-300">
      <button
        type="button"
        onClick={onResume}
        className="pointer-events-auto flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-slate-900 text-white shadow-xl border border-slate-800 active:scale-95 transition-all cursor-pointer"
      >
        <Volume2 size={14} className="text-amber-300 shrink-0" />
        <span className="text-[11px] font-black tracking-tight">音声が停止しました。タップして再開</span>
      </button>
    </div>
  );
};
