// components/ToastContainer.tsx
'use client';
import { useToast } from '@/hooks/useToast';
import { AnimatePresence, motion } from 'framer-motion';

export default function ToastContainer() {
  const toasts = useToast((state) => state.toasts);

  return (
    // モバイルを考慮して下中央、かつ z-index を最大級に設定
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-100 flex flex-col items-center gap-3 pointer-events-none w-full max-w-[90vw]">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={`
              px-6 py-3 rounded-2xl shadow-2xl shadow-indigo-200/50 text-white text-sm font-bold
              pointer-events-auto flex items-center justify-center min-w-50 text-center
              ${toast.type === 'success' && 'bg-emerald-500'}
              ${toast.type === 'error' && 'bg-rose-500'}
              ${toast.type === 'info' && 'bg-slate-800'}
            `}
          >
            {toast.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}