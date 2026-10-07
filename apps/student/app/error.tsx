'use client';

import { useEffect } from 'react';
import { Home, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { clientLogger } from '@gabby/lib/logger/client';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error }: ErrorProps) {
  useEffect(() => {
    // 画面の描画中の例外をサーバーのログへ送る（digest はサーバー側のログと突き合わせるための識別子）
    clientLogger.error('system:runtime_error', error.message || 'Client-side error', {
      err: error,
      payload: { digest: error.digest },
    });
  }, [error]);

  // シンプルにダッシュボードへのハードナビゲーション（ブラウザメモリクリア）を行う
  const handleBackToDashboard = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-canvas px-4">
      {/* 404（NotFound）画面と完全に同一の外枠コンテナ（ガタつき防止） */}
      <div className="w-full max-w-md bg-white p-8 rounded-control shadow-xl shadow-line/50 border border-line/60 min-h-[380px] flex flex-col justify-center items-center text-center">
        
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex flex-col items-center w-full"
        >
          {/* アイコンコンテナ（インディゴ系アクセントトーン） */}
          <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mb-6 relative">
            <ShieldAlert className="w-8 h-8 text-brand animate-pulse" />
          </div>

          {/* 見出しセクション */}
          <div className="mb-6">
            <span className="text-xs font-bold text-brand bg-brand-50 px-2.5 py-1 rounded-full">
              システムエラー
            </span>
            <h1 className="text-xl font-bold text-ink mt-3">
              問題が発生しました
            </h1>
            <p className="text-sm text-ink-muted mt-2 leading-relaxed max-w-sm">
              アプリケーションの処理中に予期せぬエラーが発生しました。
            </p>
          </div>

          {/* 本番環境の Vercel ログと一発で突合するための識別キー (digest) を表示 */}
          {error.digest && (
            <div className="w-full mb-6 rounded-lg bg-canvas border border-line/60 p-2 font-mono text-[11px] text-ink-subtle">
              Error ID: <span className="select-all font-semibold text-ink-muted">{error.digest}</span>
            </div>
          )}

          {/* メイン遷移ボタン（一本化） */}
          <div className="w-full space-y-3">
            <button 
              onClick={handleBackToDashboard}
              className="w-full bg-brand hover:bg-brand-strong text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 min-h-[48px] shadow-sm shadow-brand/10 hover:shadow-md hover:shadow-brand/20"
            >
              <Home size={16} />
              ダッシュボードへ戻る
            </button>

            {/* 補助用テキスト */}
            <p className="text-xs text-ink-subtle mt-4 leading-normal">
              上のボタンからダッシュボードへ戻ってください。
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
}