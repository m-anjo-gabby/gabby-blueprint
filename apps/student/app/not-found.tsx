'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, Compass, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { logClientError } from '@gabby/lib/logger/actions'; // 共通パッケージからインポート

export default function NotFound() {
  useEffect(() => {
    // 404が発生した際のコンテキスト（アクセスURLと流入元）を収集
    const currentUrl = typeof window !== 'undefined' ? window.location.href : 'Unknown URL';
    const referrer = typeof document !== 'undefined' ? document.referrer : 'No referrer';

    // サーバー側の共通アクション（Pino）を呼び出し、Vercelログへ構造化データとして記録
    logClientError({
      service: 'student',
      message: `404 Not Found: User tried to access an invalid page`,
      // system:runtime_error と区別しやすくするために digest の領域等にコンテキストを詰める
      digest: '404_NOT_FOUND',
      stack: `Requested URL: ${currentUrl}\nReferrer: ${referrer}`
    }).catch((err) => {
      console.error('Failed to send 404 log to Vercel:', err);
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      {/* 統一された外枠カード（インディゴ系デザインのガタつき防止コンテナ） */}
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 min-h-[380px] flex flex-col justify-center items-center text-center">
        
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex flex-col items-center w-full"
        >
          {/* アイコンコンテナ（インディゴ系のアクセントトーン） */}
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-6 relative">
            <Compass className="w-8 h-8 text-indigo-600 animate-[spin_20s_linear_infinite]" />
            <AlertCircle className="w-4 h-4 text-indigo-500 absolute bottom-0 right-0 bg-white rounded-full" />
          </div>

          {/* 見出しセクション */}
          <div className="mb-6">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2.5 py-1 rounded-full">
              404 Error
            </span>
            <h1 className="text-xl font-bold text-slate-800 mt-3">
              ページが見つかりません
            </h1>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-sm">
              アクセスしようとしたアドレスが存在しないか、別のURLに移動した可能性があります。
            </p>
          </div>

          {/* 状態に応じたインディゴ基調のメイン遷移ボタン */}
          <div className="w-full space-y-3">
            <Link 
              href="/dashboard" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px] shadow-sm shadow-indigo-600/10 hover:shadow-md hover:shadow-indigo-600/20"
            >
              <Home size={16} />
              ダッシュボードへ戻る
            </Link>

            {/* 補助用のセカンダリ導線 */}
            <p className="text-xs text-slate-400 mt-4 leading-normal">
              上のボタンからダッシュボードへ戻ってください。
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
}