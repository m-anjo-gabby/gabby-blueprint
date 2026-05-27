'use client';

import React, { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Lock, Zap, ChevronLeft, Sliders, Edit3, BookOpen, HelpCircle, X, ArrowRight } from 'lucide-react';
import { cn } from "@/lib/utils";
import { 
  SPRINT_TYPES, 
  SPRINT_TIME_OPTIONS, 
  type SprintQuestionType,
  type SprintAnswerType,
  SPRINT_THEMES,
  SPRINT_NOTES
} from '@gabby/types/sprint';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const mockLastSession = {
  mode: 'drill' as 'drill' | 'sprint',
  questionType: '0' as SprintQuestionType,
  level: '0',
  duration: 60,
};

const mockUserRecord: Record<string, number> = {
  CTS_LEVEL_YN: 3,
  CTS_LEVEL_UGBUILDERS: 1,
  CTS_LEVEL_UGCV: 2,
  CTS_LEVEL_UGMASTERY: 2,
};

interface SprintSelectProps {
  initialConfig?: {
    mode?: 'drill' | 'sprint';
    questionType?: SprintQuestionType;
  };
}

export const SprintSelect: React.FC<SprintSelectProps> = ({ initialConfig }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contentId = searchParams.get('content_id') || '';

  const [mode, setMode] = useState<'drill' | 'sprint'>(initialConfig?.mode || mockLastSession.mode);
  const [selectedType, setSelectedType] = useState<SprintQuestionType>(initialConfig?.questionType || mockLastSession.questionType);
  const [selectedLevel, setSelectedLevel] = useState<string>(mockLastSession.level);
  const [selectedDuration, setSelectedDuration] = useState<number>(mockLastSession.duration);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const sortedTypes = useMemo(() => Object.values(SPRINT_TYPES).sort((a, b) => a.seq_no - b.seq_no), []);
  const sortedTimes = useMemo(() => Object.values(SPRINT_TIME_OPTIONS).sort((a, b) => a.seq_no - b.seq_no), []);

  const currentTheme = useMemo(() => {
    const key = `${selectedType}_${selectedLevel}`;
    return SPRINT_THEMES[key] || '標準テーマ設定';
  }, [selectedType, selectedLevel]);

  const levelItems = useMemo(() => {
    const meta = SPRINT_TYPES[selectedType];
    const allowedLevel = mockUserRecord[meta.dbKey] ?? 0;
    const items = [];

    if (meta.hasBasic) {
      items.push({ value: '0', label: 'Basic', isLocked: false });
    }
    for (let i = 1; i <= meta.maxLevel; i++) {
      const maxAllowed = allowedLevel + (meta.hasBasic ? 1 : 0);
      const isLocked = i > maxAllowed;
      items.push({ value: String(i), label: `Lvl ${i}`, isLocked });
    }
    return items;
  }, [selectedType]);

  const handleTypeChange = (typeId: SprintQuestionType) => {
    setSelectedType(typeId);
    setSelectedLevel(SPRINT_TYPES[typeId].hasBasic ? '0' : '1');
  };

  // ────────────── 🚀 修正ポイント：ルーティングの最適化 ──────────────
  const handleStartSubmit = (answerType: SprintAnswerType = '0') => {
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('type', selectedType);
    params.set('level', selectedLevel);
    
    // スプリントかつYES/NOタイプ（'0'）の場合のみanswer_typeを動的に反映
    if (mode === 'sprint' && selectedType === '0') {
      params.set('answer_type', answerType);
    } else {
      params.set('answer_type', '0'); // デフォルト
    }

    if (contentId) params.set('content_id', contentId);
    if (mode === 'sprint') params.set('duration', String(selectedDuration));

    // 💡 プレイ用コンポーネントが配置されている正しいエンドポイントへPush
    router.push(`/training/sprint/play?${params.toString()}`);
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
                      {SPRINT_TYPES[selectedType]?.label || '---'}
                    </h3>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-600 text-white shrink-0">
                      {selectedLevel === '0' ? 'Basic' : `Lvl ${selectedLevel}`}
                    </span>
                    {mode === 'sprint' && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700 font-mono shrink-0">
                        {selectedDuration}s
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
                      <span>スプリントモード / 制限時間: {selectedDuration}秒</span>
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
                  YES主軸で開始
                </button>
                <button
                  onClick={() => handleStartSubmit('1')}
                  className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.1em] shadow-lg shadow-slate-900/10 bg-slate-900 hover:bg-slate-800 text-white active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Zap size={14} className="fill-current" />
                  NO主軸で開始
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

              <DrawerHeader className="px-8 py-0 flex items-center justify-between h-10">
                <div className="flex flex-col text-left">
                  <DrawerTitle className="text-xl font-black tracking-tight text-slate-800 leading-none">
                    Session Config
                  </DrawerTitle>
                  <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">
                    トレーニングの詳細設定
                  </span>
                </div>
                <DrawerClose asChild>
                  <button className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                    <X size={20} strokeWidth={2.5} />
                  </button>
                </DrawerClose>
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
                            {isLocked && <Lock size={9} className="absolute bottom-1.5 right-1.5 text-slate-300" />}
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
                          const isSelected = selectedDuration === opt.value;
                          return (
                            <button
                              type="button"
                              key={opt.value}
                              onClick={() => setSelectedDuration(opt.value)}
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