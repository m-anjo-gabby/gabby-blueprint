'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface ExitProcessingOverlayProps {
  visible: boolean;
}

/**
 * Drill/Sprint両プレイヤーで共通の「終了処理中」ローディングオーバーレイ。
 * マイク解放待ちの間、ユーザーの二重操作を防ぐために表示する。
 */
export const ExitProcessingOverlay: React.FC<ExitProcessingOverlayProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 bg-white/95 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in duration-300">
      <div className="text-center space-y-4 animate-in zoom-in-95 duration-200">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" strokeWidth={2.5} />
        <div className="space-y-1">
          <h3 className="text-sm font-black text-slate-800 tracking-tight">終了処理を行っています</h3>
          <p className="text-[11px] text-slate-400 font-medium">マイクの接続を解除しています。少しお待ちください...</p>
        </div>
      </div>
    </div>
  );
};
