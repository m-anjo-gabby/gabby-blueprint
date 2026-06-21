'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Lock, Zap, ChevronLeft, Sliders, Edit3, BookOpen, HelpCircle, X, ArrowRight } from 'lucide-react';
import { cn } from "@/lib/utils";
import { 
  QUESTION_TYPES, 
  SPRINT_TIME_OPTIONS, 
  type SprintQuestionType,
  type SprintAnswerType,
  SPRINT_THEMES,
  SPRINT_NOTES,
  type SprintConfig,
} from '@gabby/types/sprint';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useSprintStore } from '@/stores/useSprintStore';
import { getLastSprintSessionAction, getSprintProgressAction } from '@/actions/sprintAction';

interface SprintSelectProps {
  initialConfig?: {
    mode?: 'drill' | 'sprint';
    questionType?: SprintQuestionType;
  };
  onStart: (config: SprintConfig & { answerType: SprintAnswerType }) => void;
}

export const SprintSelect: React.FC<SprintSelectProps> = ({ initialConfig, onStart }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contentId = searchParams.get('content_id') || '';
  const store = useSprintStore();
  
  const [userProgress, setUserProgress] = useState<any>(null);
  // デフォルト値の定義 (履歴がない場合のフォールバック)
  const DEFAULT_TYPE: SprintQuestionType = '0';
  const DEFAULT_TIME = 60;

  // ストアに一度でも設定が保存されたか（＝プレイして戻ってきたか）を確認
  // かつ、現在の URL の content_id とストアの contentId が一致している場合のみ「戻り」とみなす
  const isReturningFromSession = store.questionType !== null && store.contentId === contentId;

  // 1. 状態の初期化
  // initialConfig.questionType は page.tsx で '0' がフォールバックされているため、初期値として安全に使用可能
  const initialType = isReturningFromSession
    ? (store.questionType as SprintQuestionType)
    : (initialConfig?.questionType || DEFAULT_TYPE);

  const [mode, setMode] = useState<'drill' | 'sprint'>(
    isReturningFromSession ? store.mode : (initialConfig?.mode || 'drill')
  );
  const [selectedType, setSelectedType] = useState<SprintQuestionType>(initialType);
  const [selectedLevel, setSelectedLevel] = useState<string>(
    isReturningFromSession ? store.level : (searchParams.get('level') || String(QUESTION_TYPES[initialType].minLevel))
  );
  const [selectedTimeLimitSec, setSelectedTimeLimitSec] = useState<number>(
    isReturningFromSession ? store.timeLimitSec : DEFAULT_TIME
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 2. 履歴・進捗からの初期値復元
  useEffect(() => {
    // セッションから戻ってきた場合は現在のストア状態を維持するため、DBからの取得は行わない
    if (isReturningFromSession) return;

    const fetchLastSession = async () => {
      const res = await getLastSprintSessionAction();
      if (res.success && res.data) {
        const last = res.data;
        
        // URLに明示的な指定がない項目を、最新の学習履歴に基づき復元する
        const urlType = searchParams.get('type');
        const urlLevel = searchParams.get('level');

        if (!urlType) {
          setSelectedType(last.question_type as SprintQuestionType);
          if (!urlLevel) setSelectedLevel(String(last.difficulty_level));
        } else if (!urlLevel && last.question_type === urlType) {
          setSelectedLevel(String(last.difficulty_level));
        }

        setSelectedTimeLimitSec(last.time_limit_sec);
      }

      // 到達レベル進捗の取得
      const progRes = await getSprintProgressAction();
      if (progRes.success) {
        setUserProgress(progRes.data);
      }
    };
    fetchLastSession();
  }, [isReturningFromSession, searchParams]);

  const sortedTypes = useMemo(() => Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no), []);
  const sortedTimes = useMemo(() => Object.values(SPRINT_TIME_OPTIONS).sort((a, b) => a.seq_no - b.seq_no), []);

  const currentTheme = useMemo(() => {
    const key = `${selectedType}_${selectedLevel}`;
    return SPRINT_THEMES[key] || '標準テーマ設定';
  }, [selectedType, selectedLevel]);

  const levelItems = useMemo(() => {
    const meta = QUESTION_TYPES[selectedType];
    // DBから取得した到達レベル（クリア済みレベル）。データがない場合は0とみなす
    const clearedLevel = userProgress?.[meta.dbKey] ?? 0;

    // 許可される最大レベルは「クリア済みレベル + 1」
    const maxAllowed = clearedLevel + 1;

    const items = [];

    for (let i = meta.minLevel; i <= meta.maxLevel; i++) {
      const label = i === 0 ? 'Basic' : `Lvl ${i}`;
      
      // 最小レベル(minLevel)は常にプレイ可能。それ以外は maxAllowed を超えたらロック。
      const isLocked = i > meta.minLevel && i > maxAllowed; 
      
      items.push({ value: String(i), label, isLocked });
    }
    return items;
  }, [selectedType, userProgress]);

  const handleTypeChange = (typeId: SprintQuestionType) => {
    setSelectedType(typeId);
    setSelectedLevel(String(QUESTION_TYPES[typeId].minLevel));
  };

  const handleStartSubmit = (answerType: SprintAnswerType = '0') => {
    // 🔊 iOSジェスチャー要件への対応
    // クリックイベントのコールバック内で一度音声を再生し、以後の自動再生を許可させる
    if (typeof window !== 'undefined') {
      const audio = new Audio();
      audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
      audio.play().catch(() => {});
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }

    // 親コンポーネント（page.tsx）へ選択内容を通知し、表示を切り替える
    onStart({
      mode,
      questionType: selectedType,
      level: selectedLevel,
      timeLimitSec: selectedTimeLimitSec,
      answerType: (mode === 'sprint' && selectedType === '0') ? answerType : '0'
    });
  };

  const isSpeedSelected = selectedType === '0';
  const currentHint = SPRINT_NOTES[selectedType] || '';

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-slate-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden overscroll-none touch-none select-none">
      <main className="bg-white text-slate-900 shadow-2xl border border-slate-100 w-full max-w-2xl h-full flex flex-col relative overflow-hidden rounded-[40px]">
        
        {/* ヘッダー */}
        <div className="shrink-0 pt-4 w-full overflow-hidden px-4">
          <div className="grid grid-cols-5 items-center h-12 px-2">
            <div className="col-span-1 flex justify-start">
              <button 
                onClick={() => router.back()} 
                className="h-9 w-9 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all"
              >
                <ChevronLeft size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="col-span-3 flex flex-col items-center min-w-0">
              <div className="mb-1 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/80">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none block whitespace-nowrap">Training Room</span>
              </div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none truncate w-full text-center">
                Sprint Session
              </h1>
            </div>
            <div className="col-span-1" />
          </div>
        </div>

        {/* 中央：コンテンツエリア */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 overscroll-contain">
          <div className="w-full max-w-xl mx-auto space-y-7 pt-2 pb-6">

            {/* 🌟 1. 現在の設定要約 */}
            <div 
              onClick={() => setIsSettingsOpen(true)}
              className="bg-indigo-50/75 border border-indigo-100/80 text-indigo-950 p-5 rounded-[28px] relative overflow-hidden group cursor-pointer active:scale-[0.99] transition-all shadow-md shadow-indigo-600/[0.03]"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="space-y-1.5 min-w-0 flex-1 pr-2">
                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Selected Config</span>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black tracking-tight text-indigo-900 truncate">
                      {QUESTION_TYPES[selectedType]?.label || '---'}
                    </h3>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-600 text-white shrink-0">
                      {selectedLevel === '0' ? 'Basic' : `Lvl ${selectedLevel}`}
                    </span>
                    {mode === 'sprint' && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700 font-mono shrink-0">
                        {selectedTimeLimitSec}s
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[10px] font-black bg-white/90 border border-indigo-100 px-3 py-1.5 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-xs shrink-0">
                  <Edit3 size={11} strokeWidth={2.5} />
                  <span>変更する</span>
                </div>
              </div>

              <div className="pt-3 border-t border-indigo-200/40 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black text-indigo-900">
                  {mode === 'sprint' ? (
                    <>
                      <Zap size={13} className="text-indigo-600 fill-indigo-600" />
                      <span>スプリントモード / 制限時間: {selectedTimeLimitSec}秒</span>
                    </>
                  ) : (
                    <>
                      <Sliders size={13} strokeWidth={2.5} className="text-indigo-600" />
                      <span>ドリルモード</span>
                    </>
                  )}
                </div>
                
                <p className="text-[11px] font-medium text-indigo-700/80 leading-relaxed pl-4.5">
                  {mode === 'sprint' ? (
                    "制限時間内に一問一答でテンポよく回答を重ねる、瞬発力強化モードです。"
                  ) : (
                    "自分のペースで英文を聞き、発話を繰り返す練習モードです。"
                  )}
                </p>
              </div>
            </div>

            {/* 📘 2. 出題テーマセクション */}
            <div className="px-1 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-50 text-amber-500 shrink-0">
                  <BookOpen size={12} strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-black text-amber-600/80 uppercase tracking-[0.1em]">Focus Theme / 出題テーマ</span>
              </div>
              <div className="pl-7 border-l-2 border-amber-100">
                <p className="text-base font-black text-slate-800 tracking-tight leading-relaxed">
                  {currentTheme}
                </p>
              </div>
            </div>

            {/* 💡 3. 回答のヒント */}
            {currentHint && (
              <div className="px-1 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-50/60 text-amber-500/90 shrink-0">
                    <HelpCircle size={12} strokeWidth={2.5} />
                  </div>
                  <span className="text-[10px] font-black text-amber-600/70 uppercase tracking-[0.1em]">Tips / 回答のヒント</span>
                </div>
                <div className="pl-7 border-l-2 border-amber-100/60">
                  <p className="text-xs font-bold text-slate-600 leading-relaxed">
                    {currentHint}
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* 🎮 下部確定エリア */}
        <div className="px-6 pt-4 shrink-0 border-t border-slate-50 bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="w-full max-w-xl mx-auto">
            {/* 💡 改善点: スプリントかつYES/NO選択時でも、基本的には「スプリントを開始」の1つのエントリーにする方がセッション初期化としては安全です */}
            {mode === 'sprint' && isSpeedSelected ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleStartSubmit('0')}
                  className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.1em] shadow-lg shadow-indigo-600/10 bg-indigo-600 hover:bg-indigo-700 text-white active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Zap size={14} className="fill-current" />
                  YESで回答する
                </button>
                <button
                  onClick={() => handleStartSubmit('1')}
                  className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.1em] shadow-lg shadow-slate-900/10 bg-slate-900 hover:bg-slate-800 text-white active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Zap size={14} className="fill-current" />
                  NOで回答する
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleStartSubmit('0')}
                className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-indigo-600/10 bg-indigo-600 hover:bg-indigo-700 text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <span>{mode === 'sprint' ? 'スプリント' : 'ドリル'}を開始</span>
                <ArrowRight size={14} strokeWidth={3} />
              </button>
            )}
          </div>
        </div>

        {/* 詳細設定ボトムシート */}
        <Drawer open={isSettingsOpen} onOpenChange={setIsSettingsOpen} dismissible={true}>
          <DrawerContent 
            className="max-w-2xl mx-auto h-[85vh] bg-white border-none rounded-t-[40px] shadow-2xl outline-none flex flex-col overflow-hidden text-slate-900"
            onPointerDownOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target?.closest('[data-radix-scroll-area-viewport]')) {
                e.preventDefault();
              }
            }}
          >
            <div className="shrink-0">
              <div className="flex justify-center py-4 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 rounded-full bg-slate-100" />
              </div>

              <DrawerHeader className="px-8 py-0 flex flex-col gap-3">
                <div className="flex items-center justify-between h-10">
                  <DrawerTitle className="text-xl font-black tracking-tight text-slate-800 leading-none">
                    トレーニング設定
                  </DrawerTitle>
                  <DrawerClose asChild>
                    <button className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                      <X size={20} strokeWidth={2.5} />
                    </button>
                  </DrawerClose>
                </div>

                {/* 現在の設定情報をバッジで表示（スクロールで見失わないように） */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn(
                    "text-[9px] font-black px-2 py-0.5 rounded-lg border",
                    mode === 'sprint' ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-100 border-slate-200 text-slate-600"
                  )}>
                    {mode === 'sprint' ? 'スプリント' : 'ドリル'}
                  </span>
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700">
                    {QUESTION_TYPES[selectedType]?.label}
                  </span>
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700">
                    {selectedLevel === '0' ? 'Basic' : `Lvl ${selectedLevel}`}
                  </span>
                  {mode === 'sprint' && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 font-mono">
                      {selectedTimeLimitSec}s
                    </span>
                  )}
                </div>
              </DrawerHeader>
            </div>

            <div className="flex-1 relative min-h-0 overflow-hidden border-t border-slate-50 mt-6" data-vaul-no-drag>
              <ScrollArea className="h-full w-full pr-2">
                <div className="px-8 py-4 space-y-6 pb-32">
                  
                  {/* モード選択 */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Training Mode / モード設定</span>
                    <div className="bg-slate-100 p-1 rounded-2xl grid grid-cols-2 text-center font-black text-xs border border-slate-200/40">
                      <button
                        type="button"
                        onClick={() => setMode('drill')}
                        className={cn("py-3 rounded-xl transition-all flex items-center justify-center gap-2", mode === 'drill' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                      >
                        <Sliders size={14} strokeWidth={2.5} /> ドリル
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('sprint')}
                        className={cn("py-3 rounded-xl transition-all flex items-center justify-center gap-2", mode === 'sprint' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500")}
                      >
                        <Zap size={14} className={mode === 'sprint' ? "text-white fill-current" : ""} /> スプリント
                      </button>
                    </div>
                  </div>

                  {/* スプリント種別 */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">01. Type / 種別の選択</span>
                    <div className="grid grid-cols-2 gap-2">
                      {sortedTypes.map((type) => {
                        const isSelected = selectedType === type.value;
                        return (
                          <button
                            type="button"
                            key={type.value}
                            onClick={() => handleTypeChange(type.value)}
                            className={cn("h-12 rounded-xl border text-xs font-black transition-all", isSelected ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10" : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50")}
                          >
                            {type.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* レベルマップ */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">02. Target Level / ターゲットレベル</span>
                    <div className="grid grid-cols-4 gap-2">
                      {levelItems.map((item) => {
                        const isSelected = selectedLevel === item.value;
                        const isLocked = item.isLocked;
                        return (
                          <button
                            type="button"
                            key={item.value}
                            disabled={isLocked}
                            onClick={() => setSelectedLevel(item.value)}
                            className={cn("h-10 rounded-xl border text-xs font-black relative transition-all disabled:opacity-40", isSelected ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10" : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50")}
                          >
                            {item.label}
                            {isLocked && <Lock size={11} strokeWidth={2.5} className="absolute top-1.5 left-1.5 text-slate-500" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 制限時間 */}
                  {mode === 'sprint' && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">03. Duration / 制限時間</span>
                      <div className="grid grid-cols-2 gap-2">
                        {sortedTimes.map((opt) => {
                          const isSelected = selectedTimeLimitSec === opt.value;
                          return (
                            <button
                              type="button"
                              key={opt.value}
                              onClick={() => setSelectedTimeLimitSec(opt.value)}
                              className={cn("p-3 rounded-xl border text-left transition-all flex items-center justify-between", isSelected ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10" : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50")}
                            >
                              <div>
                                <div className="text-xs font-black">{opt.label}</div>
                                <div className={cn("text-[9px] font-bold", isSelected ? "text-indigo-200" : "text-slate-400")}>{opt.desc}</div>
                              </div>
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
                <ScrollBar orientation="vertical" className="w-2.5 bg-slate-50/30" data-vaul-no-drag />
              </ScrollArea>
            </div>

            <div className="shrink-0 px-8 pt-2 bg-white pb-[max(2rem,env(safe-area-inset-bottom))] border-t border-slate-50">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
              >
                設定を保存して戻る
              </button>
            </div>

          </DrawerContent>
        </Drawer>

      </main>
    </div>
  );
};