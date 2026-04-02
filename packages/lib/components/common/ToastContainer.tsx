'use client';

import { useToastStore } from '../../stores/useToastStore'; // Storeから直接取得
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'; // アイコン追加で視認性UP

export default function ToastContainer() {
  // Storeから状態と削除アクションを購読
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  const icons = {
    success: <CheckCircle2 size={18} className="text-white" />,
    error: <AlertCircle size={18} className="text-white" />,
    info: <Info size={18} className="text-white" />,
  };

  return (
    <div 
      className="fixed bottom-10 left-1/2 -translate-x-1/2 z-200 flex flex-col items-center gap-3 pointer-events-none w-full max-w-100 px-6"
      aria-live="polite" // スクリーンリーダー対応
    >
      <AnimatePresence mode="sync">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout // リストが詰まる際のアニメーションをスムーズに
            initial={{ opacity: 0, y: 40, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
            className={`
              relative pointer-events-auto flex items-center gap-3 px-6 py-4 rounded-3xl 
              shadow-[0_20px_40px_-12px_rgba(0,0,0,0.15)] text-white text-[13px] font-black tracking-tight
              w-full sm:w-auto min-w-60
              ${toast.type === 'success' && 'bg-emerald-500 shadow-emerald-200/40'}
              ${toast.type === 'error' && 'bg-rose-500 shadow-rose-200/40'}
              ${toast.type === 'info' && 'bg-slate-900 shadow-slate-200/40'}
            `}
          >
            {/* アイコン */}
            <span className="shrink-0 opacity-90">
              {icons[toast.type || 'info']}
            </span>

            {/* メッセージ */}
            <span className="flex-1 leading-tight">
              {toast.message}
            </span>

            {/* 手動で閉じるボタン（任意ですがあると親切） */}
            <button 
              onClick={() => removeToast(toast.id)}
              className="shrink-0 ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}