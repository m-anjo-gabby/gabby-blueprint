'use client';

import { useEffect } from 'react';
import { Home, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { logClientError } from '@gabby/lib/logger/actions';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error }: ErrorProps) {
  useEffect(() => {
    // 1. サーバー側の共通アクション（Pino）を呼び出し、Vercelの構造化ログへ確実に流す
    logClientError({
      service: 'student',
      digest: error.digest,
      message: error.message || 'Student app client-side error',
      stack: error.stack,
    }).catch((err) => {
      // 万が一ネットワーク障害等で Action 自体が失敗した場合の最低限のフォールバック
      console.error('Failed to send error log to Vercel:', err);
    });
  }, [error]);

  // シンプルにダッシュボードへのハードナビゲーション（ブラウザメモリクリア）を行う
  const handleBackToDashboard = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      {/* 404（NotFound）画面と完全に同一の外枠コンテナ（ガタつき防止） */}
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 min-h-[380px] flex flex-col justify-center items-center text-center">
        
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex flex-col items-center w-full"
        >
          {/* アイコンコンテナ（インディゴ系アクセントトーン） */}
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-6 relative">
            <ShieldAlert className="w-8 h-8 text-indigo-600 animate-pulse" />
          </div>

          {/* 見出しセクション */}
          <div className="mb-6">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2.5 py-1 rounded-full">
              System Error
            </span>
            <h1 className="text-xl font-bold text-slate-800 mt-3">
              問題が発生しました
            </h1>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-sm">
              アプリケーションの処理中に予期せぬエラーが発生しました。
            </p>
          </div>

          {/* 本番環境の Vercel ログと一発で突合するための識別キー (digest) を表示 */}
          {error.digest && (
            <div className="w-full mb-6 rounded-lg bg-slate-50 border border-slate-100 p-2 font-mono text-[10px] text-slate-400">
              Error ID: <span className="select-all font-semibold text-slate-500">{error.digest}</span>
            </div>
          )}

          {/* メイン遷移ボタン（一本化） */}
          <div className="w-full space-y-3">
            <button 
              onClick={handleBackToDashboard}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px] shadow-sm shadow-indigo-600/10 hover:shadow-md hover:shadow-indigo-600/20"
            >
              <Home size={16} />
              ダッシュボードへ戻る
            </button>

            {/* 補助用テキスト */}
            <p className="text-xs text-slate-400 mt-4 leading-normal">
              上のボタンからダッシュボードへ戻ってください。
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
}