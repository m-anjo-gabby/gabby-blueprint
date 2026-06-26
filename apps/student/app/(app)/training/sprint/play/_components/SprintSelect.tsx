'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Lock, Zap, ChevronLeft, Sliders, Edit3, BookOpen, HelpCircle, X, ArrowRight, VolumeX, ChevronDown, Settings2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { 
  QUESTION_TYPES, 
  SPRINT_TIME_OPTIONS, 
  DEFAULT_SPRINT_TIME_KEY,
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
import { getSprintProgressAction } from '@/actions/sprintAction';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SprintSelectProps {
  initialConfig?: {
    mode?: 'sprint' | 'drill';
    questionType?: SprintQuestionType;
  };
  onStart: (config: SprintConfig & { answerType: SprintAnswerType }) => void;
}

export const SprintSelect: React.FC<SprintSelectProps> = ({ initialConfig, onStart }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contentId = searchParams.get('content_id') || '';
  const store = useSprintStore();
  const clearIsActiveSession = useSprintStore((state) => state.clearIsActiveSession);
  
  const [userProgress, setUserProgress] = useState<any>(null);
  
  // 💡 マスタからデフォルトキーに対応する制限秒数を動的に参照（フォールバック付き）
  const DEFAULT_TIME = SPRINT_TIME_OPTIONS[DEFAULT_SPRINT_TIME_KEY]?.value ?? 90;
  const DEFAULT_TYPE: SprintQuestionType = '0';

  // 💡 セッション（実施）から戻ってきたかどうかの判定フラグ
  const isReturningFromSession = store.isActiveSession && store.contentId === contentId;

  // =========================================================================
  // 🌟 修正箇所: 戻ってきた場合は「ストアの最終実施設定」を完全に正として同期する
  // =========================================================================
  
  // 1. モードの設定
  const [mode, setMode] = useState<'sprint' | 'drill'>(
    isReturningFromSession ? store.mode : (initialConfig?.mode || 'sprint')
  );

  // 2. 問題種別 (Type) の設定
  const [selectedType, setSelectedType] = useState<SprintQuestionType>(
    isReturningFromSession && store.questionType
      ? (store.questionType as SprintQuestionType)
      : (initialConfig?.questionType || DEFAULT_TYPE)
  );

  // 3. レベルの設定 (直前のストア値を最優先。無ければURL、最終フォールバックとしてマスタの最小値)
  const [selectedLevel, setSelectedLevel] = useState<string>(
    isReturningFromSession 
      ? store.level 
      : (searchParams.get('level') || String(QUESTION_TYPES[selectedType]?.minLevel ?? '0'))
  );

  // 4. 制限時間の設定 (直前のストア値を最優先。無ければ動的デフォルト値)
  const [selectedTimeLimitSec, setSelectedTimeLimitSec] = useState<number>(
    isReturningFromSession ? store.timeLimitSec : DEFAULT_TIME
  );
  
  // =========================================================================

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isHintOpen, setIsHintOpen] = useState(false);

  useEffect(() => {
    // コンポーネントがマウントされたらアクティブセッションのフラグを下ろす（戻り判定完了のため）
    clearIsActiveSession();
    
    if (isReturningFromSession) return;

    const fetchProgress = async () => {
      const progRes = await getSprintProgressAction();
      if (progRes.success) {
        setUserProgress(progRes.data);
      }
    };
    fetchProgress();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedTypes = useMemo(() => Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no), []);
  const sortedTimes = useMemo(() => Object.values(SPRINT_TIME_OPTIONS).sort((a, b) => a.seq_no - b.seq_no), []);

  const currentTheme = useMemo(() => {
    const key = `${selectedType}_${selectedLevel}`;
    return SPRINT_THEMES[key] || '標準テーマ設定';
  }, [selectedType, selectedLevel]);

  const levelItems = useMemo(() => {
    const meta = QUESTION_TYPES[selectedType];
    if (!meta) return [];
    
    const clearedLevel = userProgress?.[meta.dbKey] ?? 0;
    const maxAllowed = clearedLevel + 1;
    const items = [];

    for (let i = meta.minLevel; i <= meta.maxLevel; i++) {
      const label = i === 0 ? 'Basic' : `Lv ${i}`;
      const isLocked = i > meta.minLevel && i > maxAllowed; 
      items.push({ value: String(i), label, isLocked });
    }
    return items;
  }, [selectedType, userProgress]);

  const handleTypeChange = (typeId: SprintQuestionType) => {
    setSelectedType(typeId);
    setSelectedLevel(String(QUESTION_TYPES[typeId]?.minLevel ?? '0'));
  };

  const handleStartSubmit = (answerType: SprintAnswerType = '0') => {
    if (typeof window !== 'undefined') {
      const audio = new Audio();
      audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
      audio.play().catch(() => {});
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }

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
    <div className="fixed inset-0 w-full h-[100dvh] bg-slate-100 flex items-center justify-center p-2 sm:p-4 overflow-hidden overscroll-none touch-none select-none">
      <main className="bg-white text-slate-900 shadow-2xl w-full max-w-2xl h-full flex flex-col relative overflow-hidden rounded-[40px]">
        
        {/* ヘッダーセクション */}
        <div className="shrink-0 pt-5 pb-3 w-full overflow-hidden bg-white z-20 border-b border-slate-50 shadow-xs">
          <div className="flex items-start justify-between px-6 gap-3">
            
            <button 
              onClick={() => router.back()} 
              className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 shadow-3xs hover:bg-slate-100 hover:text-slate-600 active:scale-95 transition-all mt-0.5"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex-1 min-w-0 flex flex-col items-center py-1 px-2 rounded-2xl hover:bg-slate-50/80 active:scale-[0.99] transition-all group relative border border-transparent hover:border-slate-100/80"
            >
              <div className="mb-1 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none block whitespace-nowrap">
                  Current Target
                </span>
              </div>
              
              <div className="flex items-center justify-center gap-1.5 w-full max-w-[80%]">
                <h1 className="text-base font-black text-slate-800 tracking-tight leading-tight truncate text-center">
                  {QUESTION_TYPES[selectedType]?.label || '---'}
                </h1>
                <Settings2 size={13} className="text-slate-300 group-hover:text-indigo-500 group-hover:rotate-45 transition-all shrink-0" strokeWidth={2.5} />
              </div>

              <div className="flex items-center gap-1.5 mt-1.5 shrink-0">
                <span className={cn(
                  "text-[10px] font-black px-2 py-0.5 rounded-md text-white leading-none tracking-wide", 
                  mode === 'sprint' ? "bg-indigo-600" : "bg-slate-800"
                )}>
                  {selectedLevel === '0' ? 'Basic' : `Lv ${selectedLevel}`}
                </span>
                {mode === 'sprint' && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono leading-none">
                    {selectedTimeLimitSec}s
                  </span>
                )}
              </div>
            </button>

            <div className="w-10 h-10 shrink-0 opacity-0 pointer-events-none" />
          </div>
        </div>

        {/* メイン空間コンテナ */}
        <div className={cn(
          "flex-1 min-h-0 flex flex-col transition-colors duration-300",
          mode === 'sprint' ? "bg-indigo-50/30" : "bg-slate-50/50"
        )}>
          
          {/* モード選択セクション */}
          <div className="shrink-0 w-full pt-5 pb-1">
            <div className="max-w-xl mx-auto px-6 flex flex-col gap-2">
              
              <div className="flex items-center gap-1.5 pl-0.5">
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-widest transition-colors",
                  mode === 'sprint' ? "text-indigo-400/90" : "text-slate-400"
                )}>
                  Select Mode / モード選択
                </span>
                <Dialog>
                  <DialogTrigger asChild>
                    <button className={cn(
                      "h-4.5 w-4.5 flex items-center justify-center rounded-full text-xs transition-colors",
                      mode === 'sprint' ? "bg-indigo-100 text-indigo-500 hover:bg-indigo-200" : "bg-slate-200/80 text-slate-500 hover:bg-slate-300"
                    )}>
                      <HelpCircle size={11} strokeWidth={2.5} />
                    </button>
                  </DialogTrigger>
                  
                  <DialogContent 
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border-none bg-white p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-2xl text-slate-900 outline-none"
                  >
                    <DialogHeader>
                      <DialogTitle className="text-sm font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        Mode Guide / モード解説
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-3">
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-indigo-600 flex items-center gap-1.5">
                          <Zap size={14} className="fill-current text-indigo-500" /> スプリントモード
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed font-bold">
                          制限時間内に一問一答でテンポよく回答を重ねる、瞬発力強化モードです。音声評価を原則としますが、声が出せない場合はスキップも可能です。
                        </p>
                      </div>
                      <hr className="border-slate-100" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                          <Sliders size={14} className="text-slate-500" /> ドリルモード
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed font-bold">
                          自分のペースで英文を聞き、発話を繰り返す練習モードです。声を出せない環境でのフレーズ確認にも適しています。
                        </p>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('sprint')}
                  className={cn(
                    "flex-1 py-3.5 px-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs font-black shadow-2xs",
                    mode === 'sprint'
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 scale-[1.01]"
                      : "bg-white text-slate-400 hover:text-slate-600 border border-slate-200/40"
                  )}
                >
                  <Zap size={14} className={mode === 'sprint' ? "fill-current text-amber-300" : "text-slate-400"} />
                  <span>スプリント</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('drill')}
                  className={cn(
                    "flex-1 py-3.5 px-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs font-black shadow-2xs",
                    mode === 'drill'
                      ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10 scale-[1.01]"
                      : "bg-white text-slate-400 hover:text-slate-600 border border-slate-200/40"
                  )}
                >
                  <Sliders size={14} strokeWidth={3} className={mode === 'drill' ? "text-teal-400" : "text-slate-400"} />
                  <span>ドリル</span>
                </button>
              </div>
            </div>
          </div>

          {/* メインスクロールコンテンツ */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2 overscroll-contain">
            <div className="w-full max-w-xl mx-auto space-y-4 pt-2 pb-6">

              {/* 注意文言 */}
              {mode === 'sprint' && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100/40 text-amber-900 shadow-3xs animate-in fade-in slide-in-from-top-2 duration-200">
                  <VolumeX size={13} className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="text-[11px] font-bold leading-normal">
                    移動中など声が出せない環境ですか？スプリント中も<span className="underline decoration-amber-400 decoration-2 font-black">スキップボタン</span>で発話評価をパスして次に進めます。
                  </p>
                </div>
              )}

              {/* 詳細設定リンク */}
              <button 
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className={cn(
                  "w-full text-left p-4 rounded-2xl relative overflow-hidden active:scale-[0.99] transition-all bg-white block z-10 border shadow-2xs group",
                  mode === 'sprint' ? "border-indigo-100/80 hover:border-indigo-200" : "border-slate-200/80 hover:border-slate-300"
                )}
              >
                <div className="flex justify-between items-center">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <span className={cn("text-[9px] font-black uppercase tracking-widest block", mode === 'sprint' ? "text-indigo-500" : "text-slate-500")}>
                      Configuration / トレーニング設定
                    </span>
                    <div className="text-xs font-bold text-slate-500 flex items-center gap-1">
                      <span>問題種別・レベル・制限時間をカスタマイズする</span>
                    </div>
                  </div>

                  <div className={cn(
                    "flex items-center gap-1 text-[10px] font-black bg-slate-50 border px-3 py-1.5 rounded-xl transition-all shrink-0 shadow-3xs group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-200",
                    mode === 'sprint' ? "border-indigo-100/60 text-indigo-600" : "border-slate-200 text-slate-600"
                  )}>
                    <Edit3 size={11} strokeWidth={2.5} />
                    <span>設定変更</span>
                  </div>
                </div>
              </button>

              {/* テーマ・ヒントのアコーディオンセクション */}
              <div className="space-y-2">
                
                {/* テーマ・アコーディオン */}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-3xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsThemeOpen(!isThemeOpen)}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left select-none active:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <BookOpen size={12} strokeWidth={2.5} />
                      </div>
                      <span className="text-xs font-black text-slate-700 truncate">出題テーマを確認</span>
                    </div>
                    <ChevronDown size={14} className={cn("text-slate-400 transition-transform duration-200", isThemeOpen && "rotate-180")} strokeWidth={2.5} />
                  </button>
                  
                  <div className={cn(
                    "grid transition-all duration-200 ease-in-out",
                    isThemeOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}>
                    <div className="overflow-hidden">
                      <div className="px-4 pb-4 pt-1 border-t border-slate-50/60">
                        <p className="text-xs font-bold text-slate-600 leading-relaxed bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                          {currentTheme}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ヒント (TIPS) ・アコーディオン */}
                <div className={cn(
                  "bg-white border rounded-2xl shadow-3xs overflow-hidden transition-all",
                  currentHint ? "border-slate-100 opacity-100" : "border-slate-100 opacity-50 pointer-events-none"
                )}>
                  <button
                    type="button"
                    disabled={!currentHint}
                    onClick={() => setIsHintOpen(!isHintOpen)}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left select-none active:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        "h-6 w-6 rounded-md flex items-center justify-center shrink-0",
                        currentHint ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"
                      )}>
                        <HelpCircle size={12} strokeWidth={2.5} />
                      </div>
                      <span className="text-xs font-black text-slate-700 truncate">回答のヒント (Tips)</span>
                    </div>
                    <ChevronDown size={14} className={cn("text-slate-400 transition-transform duration-200", isHintOpen && "rotate-180")} strokeWidth={2.5} />
                  </button>
                  
                  <div className={cn(
                    "grid transition-all duration-200 ease-in-out",
                    isHintOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}>
                    <div className="overflow-hidden">
                      <div className="px-4 pb-4 pt-1 border-t border-slate-50/60">
                        <p className="text-xs font-medium text-slate-600 leading-relaxed bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                          {currentHint}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>

        {/* 下部確定エリア */}
        <div className="px-6 pt-4 shrink-0 bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.015)] z-20">
          <div className="w-full max-w-xl mx-auto">
            {mode === 'sprint' && isSpeedSelected ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleStartSubmit('0')}
                  className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.1em] shadow-lg shadow-indigo-600/10 bg-indigo-600 hover:bg-indigo-700 text-white active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Zap size={14} className="fill-current text-amber-300" />
                  YESで回答する
                </button>
                <button
                  onClick={() => handleStartSubmit('1')}
                  className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.1em] shadow-lg shadow-slate-900/10 bg-slate-900 hover:bg-slate-800 text-white active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Zap size={14} className="fill-current text-indigo-300" />
                  NOで回答する
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleStartSubmit('0')}
                className={cn(
                  "w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-white",
                  mode === 'sprint' ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10" : "bg-slate-900 hover:bg-slate-800 shadow-slate-900/10"
                )}
              >
                <span>{mode === 'sprint' ? 'スプリント' : 'ドリル'}を開始</span>
                <ArrowRight size={14} strokeWidth={3} />
              </button>
            )}
          </div>
        </div>

        {/* 詳細設定ボトムシート (Drawer) */}
        <Drawer open={isSettingsOpen} onOpenChange={setIsSettingsOpen} dismissible={true}>
          <DrawerContent 
            className="max-w-2xl mx-auto h-[80vh] bg-white border-none rounded-t-[40px] shadow-2xl outline-none flex flex-col overflow-hidden text-slate-900"
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

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn(
                    "text-[9px] font-black px-2 py-0.5 rounded-lg border text-white",
                    mode === 'sprint' ? "bg-indigo-600 border-indigo-600" : "bg-slate-900 border-slate-900"
                  )}>
                    {mode === 'sprint' ? 'sprint' : 'drill'}
                  </span>
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700">
                    {QUESTION_TYPES[selectedType]?.label}
                  </span>
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700">
                    {selectedLevel === '0' ? 'Basic' : `Lv ${selectedLevel}`}
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
                  
                  {/* 01. 種別 */}
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
                            className={cn(
                              "h-12 rounded-xl border text-xs font-black transition-all", 
                              isSelected 
                                ? (mode === 'sprint' ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-900 border-slate-900 text-white") 
                                : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            {type.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 02. レベル */}
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
                            className={cn(
                              "h-10 rounded-xl border text-xs font-black relative transition-all disabled:opacity-40", 
                              isSelected 
                                ? (mode === 'sprint' ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-900 border-slate-900 text-white") 
                                : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            {item.label}
                            {isLocked && <Lock size={11} strokeWidth={2.5} className="absolute top-1.5 left-1.5 text-slate-500" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 03. 制限時間 */}
                  {mode === 'sprint' && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">03. Duration / 制限時間</span>
                      <div className="grid grid-cols-2 gap-2">
                        {sortedTimes.map((opt) => {
                          const isSelected = selectedTimeLimitSec === opt.value;
                          return (
                            <button
                              type="button"
                              key={opt.seq_no}
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
                確定して戻る
              </button>
            </div>

          </DrawerContent>
        </Drawer>

      </main>
    </div>
  );
};