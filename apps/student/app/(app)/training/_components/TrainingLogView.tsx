'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, BarChart3, BookOpen, Zap, ArrowRight, Library } from 'lucide-react';
import { motion } from 'framer-motion';

export const TrainingLogView: React.FC = () => {
  const router = useRouter();

  // 履歴確認のためのメニュー（教材選択ではなく、あくまで「ログを見るため」の導線）
  const menuItems = [
    {
      title: '単語ドリル履歴',
      englishTitle: 'Word Drill History',
      description: 'これまでに学習した単語数、フレーズ数、発話評価の履歴を確認します。',
      path: '/training/word/history',
      icon: <BookOpen size={20} />,
      colorClass: 'from-blue-500 to-indigo-600',
      badge: 'Word'
    },
    {
      title: 'スプリント履歴',
      englishTitle: 'Sprint History',
      description: '瞬発的な発話トレーニングのスコアや過去の回答ログを確認します。',
      path: '/training/sprint/history',
      icon: <Zap size={20} />,
      colorClass: 'from-amber-500 to-orange-600',
      badge: 'Sprint'
    }
  ];

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-blue-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-100 rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-fade-in">

        {/* ────────────── ヘッダー ────────────── */}
        <div className="shrink-0 bg-slate-900 p-5 sm:p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <BarChart3 size={120} strokeWidth={1} />
          </div>

          <div className="relative space-y-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push('/dashboard')}
                className="h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all text-[10px] font-black uppercase tracking-wider backdrop-blur-md border border-white/10"
              >
                <ChevronLeft size={12} strokeWidth={3} />
                <span>ダッシュボードへ</span>
              </button>
              <div className="text-right">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Training Logs Hub</span>
                <p className="text-[9px] font-bold text-slate-500 opacity-80">トレーニング総合ログ</p>
              </div>
            </div>

            <div className="pt-2 border-t border-white/5">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-none flex items-center gap-2.5">
                <BarChart3 className="text-indigo-400" size={24} />
                <span>トレーニング履歴</span>
              </h1>
              <p className="text-[11px] font-bold text-slate-400 mt-2">
                確認したい履歴カテゴリーを選択、または下のボタンからライブラリへ移動してトレーニングを開始できます。
              </p>
            </div>
          </div>
        </div>

        {/* ────────────── メイン：メニューカード一覧 ────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5 sm:p-6">
          <div className="max-w-xl mx-auto space-y-4">
            {menuItems.map((item, index) => (
              <motion.div
                key={item.path}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3, ease: 'easeOut' }}
              >
                <button
                  onClick={() => router.push(item.path)}
                  className="w-full text-left p-5 bg-white border border-slate-100 rounded-[32px] shadow-sm flex items-center justify-between hover:border-indigo-100 hover:shadow-md transition-all group active:scale-[0.99] cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 bg-gradient-to-br ${item.colorClass} rounded-2xl flex items-center justify-center text-white shrink-0 shadow-sm transition-transform group-hover:scale-105 duration-300`}>
                      {item.icon}
                    </div>

                    <div className="space-y-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-mono uppercase">
                          {item.badge}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-tight">
                          {item.englishTitle}
                        </span>
                      </div>
                      <h2 className="text-base font-black text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">
                        {item.title} を見る
                      </h2>
                      <p className="text-xs font-medium text-slate-400 leading-snug">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all shrink-0">
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ────────────── フッター：既存の教材一覧(Library)への導線 ────────────── */}
        <div className="shrink-0 p-5 sm:p-6 bg-white border-t border-slate-100 flex flex-col items-center gap-2">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
            New Session
          </p>
          <button
            onClick={() => router.push('/library')}
            className="w-full max-w-sm h-12 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span>教材一覧（ライブラリ）を開く</span>
            <Library size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};