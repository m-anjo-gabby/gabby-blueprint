'use client';

import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

interface ContentLoadingProps {
  /**
   * 画面中央に表示するメインの英語テキスト
   * @default "Preparing your session"
   */
  title?: string;
  /**
   * 画面の下部や補助として見せる日本語サブテキスト（オプショナル）
   */
  subtitle?: string;
}

export function ContentLoading({
  title = 'Preparing your session',
  subtitle,
}: ContentLoadingProps) {
  return (
    <div 
      className="fixed inset-0 bg-[#f5f5f7] flex items-center justify-center p-6 z-50"
      role="status"
      aria-live="polite"
      aria-label="Loading content"
    >
      <div className="w-full max-w-sm text-center space-y-8">
        {/* スピナーアニメーションエリア */}
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 border-4 border-indigo-100 rounded-2xl" />
          <motion.div 
            className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-2xl"
            animate={{ rotate: 360 }}
            transition={{
              repeat: Infinity,
              duration: 1,
              ease: 'linear'
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
            <BookOpen size={32} className="animate-pulse" />
          </div>
        </div>

        {/* テキスト & プログレスバーバーエリア */}
        <div className="space-y-3">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm font-medium text-slate-500">
              {subtitle}
            </p>
          )}
          <div className="w-48 h-1 bg-slate-200 rounded-full overflow-hidden mx-auto mt-4 relative">
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ 
                repeat: Infinity, 
                duration: 1.5, 
                ease: 'easeInOut' 
              }}
              className="absolute top-0 bottom-0 left-0 w-full bg-indigo-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}