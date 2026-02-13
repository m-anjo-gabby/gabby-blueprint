'use client';

import { useState, useEffect } from 'react';
import CorpusCard from '@/components/student/CorpusCard';
import { ClientInfo, getClientCorpusList, getMyClientInfo, type CorpusRecord } from '@/actions/dashboardAction';
import { BookOpen, ArrowRight, Star } from 'lucide-react';
import Image from 'next/image';
import { getFavoriteCount } from '@/actions/corpusAction';
import FavoriteList from '@/components/student/FavoriteList';
import CourseLibrary from '@/components/student/CourseLibrary';

type ViewMode = 'dashboard' | 'training' | 'favorites' | 'library';

/**
 * 学習者用メインダッシュボード
 * 顧客に紐付いたコーパス（学習教材）を一覧表示し、学習セクションへの入り口を提供します。
 */
export default function StudentDashboard() {
  // --- State ---
  const [selectedCorpusId, setSelectedCorpusId] = useState<string | null>(null);
  const [corpusList, setCorpusList] = useState<CorpusRecord[]>([]);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('dashboard');

  // --- スクロールリセット ---
  useEffect(() => {
    // ページマウント時、またはコーパス選択解除（selectedCorpusIdがnullに戻った時）に実行
    if (!selectedCorpusId) {
      setTimeout(() => {
        const main = document.querySelector('main');
        main?.scrollTo(0, 0);
      }, 50);
    }
  }, [selectedCorpusId]);

  // --- Data Fetching ---
  useEffect(() => {
    async function initDashboard() {
      try {
        // 並列で取得
        const [corpusData, clientData, favCount] = await Promise.all([
          getClientCorpusList(),
          getMyClientInfo(),
          getFavoriteCount()
        ]);
        setCorpusList(corpusData);
        setClientInfo(clientData);
        setFavoriteCount(favCount);
      } catch (error) {
        console.error("Dashboard Load Error:", error);
      } finally {
        setLoading(false);
      }
    }
    initDashboard();
  }, []);

  // 共通の戻る処理 + カウント更新
  const handleBackAndRefresh = async () => {
    setView('dashboard'); // 画面を戻す
    
    try {
      // 最新の件数を取得して反映
      const favCount = await getFavoriteCount();
      setFavoriteCount(favCount);
    } catch (error) {
      console.error("Failed to refresh favorite count:", error);
    }
  };

  // --- View: Mode ---
  // コーパス選択時は学習カード画面（子コンポーネント）へ切り替え
  if (view === 'training' && selectedCorpusId) {
    return <CorpusCard sectionId={selectedCorpusId} onBack={handleBackAndRefresh} />;
  }

  // コース選択時はコース一覧（子コンポーネント）へ切り替え
  if (view === 'library') {
    return (
      <CourseLibrary 
        corpusList={corpusList} 
        onSelect={(id) => {
          setSelectedCorpusId(id);
          setView('training');
        }}
        onBack={() => setView('dashboard')} 
      />
    );
  }

  // お気に入り選択時はフレーズ一覧（子コンポーネント）へ切り替え
  if (view === 'favorites') {
    return <FavoriteList onBack={handleBackAndRefresh} />;
  }
  // --- View: Loading State ---
  // 読み込み中
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-100 space-y-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="text-slate-400 text-sm font-medium animate-pulse">Loading Curriculums...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out">
      
      {/* Header Section: サービスロゴとガイドメッセージ */}
      <div className="flex flex-col items-center text-center space-y-4">
        {/* ロゴ外側のコンテナ：サイズを固定し、はみ出しを防ぐ */}
        <div className="relative w-full max-w-60 h-20">
          {clientInfo?.logo_url ? (
            <Image 
              src={clientInfo.logo_url} 
              alt={clientInfo.client_name || "Client Logo"}
              fill
              sizes="240px"
              /* object-contain で比率を維持しつつ、最大サイズまで広げる */
              className="object-contain"
              priority
            />
          ) : (
            /* ロゴがない場合のフォールバック（テキストのみでシンプルに） */
            <div className="text-4xl font-black text-indigo-600 tracking-tighter">
              BLUEPRINT
            </div>
          )}
        </div>
        
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
            Blueprint English
            <span className="text-indigo-600 block text-lg mt-2 font-bold">
              for {clientInfo?.dashboard_title || 'Personal'}
            </span>
          </h1>
          <p className="text-slate-500 font-medium tracking-wide text-sm">学習する教材を選択してください</p>
        </div>
      </div>

      {/* Info Stats Bar: 学習状況とアクション導線 */}
      <div className="grid grid-cols-2 gap-4 px-2">
        
        {/* 左側：Courses (教材一覧ライブラリへのボタン) */}
        <button 
          onClick={() => setView('library')}
          className="group bg-white p-4 rounded-3xl border border-indigo-100 shadow-sm hover:shadow-lg hover:shadow-indigo-100 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
              <BookOpen size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-indigo-600/60 uppercase leading-none mb-1 tracking-wider">Courses</p>
              <p className="text-sm font-black text-slate-800 leading-none">
                {corpusList.length} <span className="text-[11px] font-medium text-slate-500">Books</span>
              </p>
            </div>
          </div>
          <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
        </button>

        {/* 右側：Favorites (お気に入り一覧ライブラリへのボタン)  */}
        <button 
          onClick={() => setView('favorites')}
          className="group bg-white p-4 rounded-3xl border border-amber-200 shadow-sm hover:shadow-lg hover:shadow-amber-100 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300">
              <Star size={20} fill="currentColor" className={favoriteCount > 0 ? "animate-pulse" : ""} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-amber-600/60 uppercase leading-none mb-1 tracking-wider">Favorites</p>
              <p className="text-sm font-black text-slate-800 leading-none">
                {favoriteCount} <span className="text-[11px] font-medium text-slate-500">Items</span>
              </p>
            </div>
          </div>
          <ArrowRight size={14} className="text-slate-300 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
        </button>
      </div>

      {/* Corpus Selection Grid: コーパス一覧をカード形式で表示 */}
      <div className="grid gap-5">
        {corpusList.length > 0 ? (
          corpusList.map((corpus) => (
            <button
              key={corpus.corpus_id}
              onClick={() => {
                  setSelectedCorpusId(corpus.corpus_id);
                  setView('training');
              }}
              className="group relative w-full text-left p-8 bg-white rounded-[36px] border border-slate-200/80 shadow-sm hover:shadow-2xl hover:shadow-indigo-100/50 hover:-translate-y-1.5 transition-all duration-500 isolate overflow-hidden"
            >
              {/* iPhone Safari対策の isolate / overflow-hidden。背景の装飾レイヤー */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-indigo-100/80 transition-colors"></div>

              <div className="relative space-y-5">
                <div className="flex justify-between items-start">
                  <div className="space-y-1.5">
                    {/* ラベル: 業界区分やバージョンを表示 */}
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 group-hover:scale-150 transition-transform duration-500"></span>
                      <span className="text-[10px] font-bold text-indigo-500 tracking-[0.15em] uppercase">
                        {corpus.corpus_label}
                      </span>
                    </div>
                    {/* コーパス名称: 専門領域タイトル */}
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight leading-tight group-hover:text-indigo-600 transition-colors">
                      {corpus.corpus_name}
                    </h2>
                  </div>
                  {/* 右側の矢印アイコン。ホバー時に強調 */}
                  <div className="p-3 bg-slate-50 rounded-2xl text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-inner">
                    <ArrowRight size={20} />
                  </div>
                </div>

                {/* コーパス説明文: 2行までに制限（line-clamp-2） */}
                <p className="text-sm text-slate-500 leading-relaxed font-medium opacity-90 line-clamp-2 pr-6">
                  {corpus.description}
                </p>

                {/* Footer Meta: 学習実績を匂わせる装飾とアクション導線 */}
                <div className="pt-5 flex items-center justify-between border-t border-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2.5">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="w-7 h-7 rounded-full border-2 border-white bg-slate-100 shadow-sm overflow-hidden">
                          <div className={`w-full h-full bg-indigo-${i}00/30`} />
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 italic">Recommended for you</span>
                  </div>
                  <span className="text-[11px] font-bold text-indigo-600 group-hover:translate-x-1 transition-transform">
                    START TRAINING →
                  </span>
                </div>
              </div>
            </button>
          ))
        ) : (
          /* Empty State: データ未登録時のフォールバック表示 */
          <div className="text-center p-20 bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[40px]">
             <p className="text-slate-400 font-bold italic tracking-wider text-sm">利用可能なコーパスがありません。</p>
          </div>
        )}
      </div>
    </div>
  );
}