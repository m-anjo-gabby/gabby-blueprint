'use client';

import { useState, useEffect } from 'react';
import TrainingCard from '@/components/student/CorpusCard';
import { getClientCorpusList, type CorpusRecord } from '@/actions/dashboardAction';
import { BookOpen, GraduationCap, ArrowRight } from 'lucide-react';

/**
 * 学習者用メインダッシュボード
 * 顧客に紐付いたコーパス（学習教材）を一覧表示し、学習セクションへの入り口を提供します。
 */
export default function StudentDashboard() {
  // --- State ---
  const [selectedCorpusId, setSelectedCorpusId] = useState<string | null>(null);
  const [corpusList, setCorpusList] = useState<CorpusRecord[]>([]);
  const [loading, setLoading] = useState(true);

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

  // --- Auth Configuration (Temporary) ---
  // TODO: ログインユーザーの所属（com_m_user）から取得するように変更予定
  const FIXED_CLIENT_ID = 1;

  // --- Data Fetching ---
  useEffect(() => {
    async function fetchCorpus() {
      try {
        const data = await getClientCorpusList(FIXED_CLIENT_ID);
        // dataをCorpusRecord[]にマッピング
        setCorpusList(data);
      } catch (error) {
        // デモ環境でのエラー視認性を考慮し、console.errorを維持
        console.error("Dashboard Load Error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchCorpus();
  }, []);

  // --- View: Training Mode ---
  // コーパス選択時は学習カード画面（子コンポーネント）へ切り替え
  if (selectedCorpusId) {
    return (
      <TrainingCard 
        sectionId={selectedCorpusId} 
        onBack={() => setSelectedCorpusId(null)} 
      />
    );
  }

  // --- View: Loading State ---
  // 読み込み中。プロフェッショナルな印象を与えるため、カスタムアニメーションを配置
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[400px] space-y-4">
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
        {/* ロゴ外側のコンテナ：ここでもサイズを固定し、はみ出しを防ぐ */}
        <div className="relative w-16 h-16 min-w-[64px] min-h-[64px]">
          {/* ロゴ本体：
            - shrink-0: 親要素の都合で縮ませない
            - aspect-square: 比率を1:1に固定
            - w-full h-full: 親の w-16 h-16 を継承
          */}
          <div className="w-full h-full shrink-0 aspect-square bg-linear-to-br from-indigo-600 to-violet-700 rounded-[22px] flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-indigo-200 rotate-3 transition-transform hover:rotate-0 isolate">
            B
          </div>
          
          {/* オンライン状態インジケーター：ロゴの右下に固定 */}
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 border-4 border-slate-50 rounded-full z-10"></div>
        </div>
        
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">Blueprint English</h1>
          <p className="text-slate-500 font-medium tracking-wide text-sm">学習する教材を選択してください</p>
        </div>
      </div>

      {/* Info Stats Bar: デモ映えする学習状況の簡易概要 */}
      <div className="grid grid-cols-2 gap-4 px-2">
        <div className="bg-white/60 backdrop-blur-sm p-4 rounded-3xl border border-slate-200/60 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
            <BookOpen size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Courses</p>
            <p className="text-sm font-bold text-slate-700">{corpusList.length} Available</p>
          </div>
        </div>
        <div className="bg-white/60 backdrop-blur-sm p-4 rounded-3xl border border-slate-200/60 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <GraduationCap size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Status</p>
            <p className="text-sm font-bold text-slate-700">Ready</p>
          </div>
        </div>
      </div>

      {/* Corpus Selection Grid: コーパス一覧をカード形式で表示 */}
      <div className="grid gap-5">
        {corpusList.length > 0 ? (
          corpusList.map((corpus) => (
            <button
              key={corpus.corpus_id}
              onClick={() => setSelectedCorpusId(corpus.corpus_id)}
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