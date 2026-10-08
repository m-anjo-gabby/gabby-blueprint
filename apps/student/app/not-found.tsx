'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, Compass, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { clientLogger } from '@gabby/lib/logger/client';

export default function NotFound() {
  useEffect(() => {
    // 存在しない画面へのアクセスを記録する（表示中のパスは clientLogger が付ける。流入元はクエリを除く）
    clientLogger.warn('system:not_found', 'Page not found', {
      payload: { referrer: document.referrer.split('?')[0] || undefined },
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-canvas px-4">
      {/* 統一された外枠カード（インディゴ系デザインのガタつき防止コンテナ） */}
      <div className="w-full max-w-md bg-white p-8 rounded-control shadow-xl shadow-line/50 border border-line/60 min-h-[380px] flex flex-col justify-center items-center text-center">
        
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex flex-col items-center w-full"
        >
          {/* アイコンコンテナ（インディゴ系のアクセントトーン） */}
          <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mb-6 relative">
            <Compass className="w-8 h-8 text-brand animate-[spin_20s_linear_infinite]" />
            <AlertCircle className="w-4 h-4 text-brand-500 absolute bottom-0 right-0 bg-white rounded-full" />
          </div>

          {/* 見出しセクション */}
          <div className="mb-6">
            <span className="text-xs font-bold text-brand bg-brand-50 px-2.5 py-1 rounded-full">
              404 Error
            </span>
            <h1 className="text-xl font-bold text-ink mt-3">
              ページが見つかりません
            </h1>
            <p className="text-sm text-ink-muted mt-2 leading-relaxed max-w-sm">
              アクセスしようとしたアドレスが存在しないか、別のURLに移動した可能性があります。
            </p>
          </div>

          {/* 状態に応じたインディゴ基調のメイン遷移ボタン */}
          <div className="w-full space-y-3">
            <Link 
              href="/dashboard" 
              className="w-full bg-brand hover:bg-brand-strong text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px] shadow-sm shadow-brand/10 hover:shadow-md hover:shadow-brand/20"
            >
              <Home size={16} />
              ダッシュボードへ戻る
            </Link>

            {/* 補助用のセカンダリ導線 */}
            <p className="text-xs text-ink-subtle mt-4 leading-normal">
              上のボタンからダッシュボードへ戻ってください。
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
}