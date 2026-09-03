'use client';

import { X } from 'lucide-react';

/** 別タブで開いたライブセッション画面から、タブそのものを閉じるための共通ボタン */
export function CloseTabButton() {
  return (
    <button
      onClick={() => window.close()}
      className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
    >
      <X size={14} />
      Close Tab
    </button>
  );
}
