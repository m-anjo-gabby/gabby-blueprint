'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Lock, ChevronLeft, Sliders, HelpCircle, Lightbulb, ArrowRight, ChevronDown, ChevronRight, Mic, MicOff, Loader2, BookOpen, Settings2, AlertTriangle, Timer, Zap, Home } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from 'framer-motion';
import { QUESTION_TYPES, SPRINT_TIME_OPTIONS, DEFAULT_SPRINT_TIME_KEY, type SprintQuestionType, type SprintAnswerType, type SprintConfig } from '@gabby/types/sprint';
import { SPRINT_THEMES, SPRINT_NOTES, getSprintTitle, resolveSprintHasLevel, setAudioSessionPlayAndRecord } from '@gabby/lib';
import { useMicPermission } from '@gabby/lib/hooks/useMicPermission';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useSprintStore } from '@/stores/useSprintStore';
import { getSprintProgressAction } from '@/actions/sprintAction';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import ConfirmContainer from '@gabby/lib/components/common/ConfirmContainer';
import { AudioTroubleshootingDialog } from '@/components/help/AudioTroubleshootingDialog';
import { MicTroubleshootingDialog } from '@/components/help/MicTroubleshootingDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface SprintSelectProps {
  onStart: (config: SprintConfig & { answerType: SprintAnswerType; isAssessmentMode: boolean }) => void;
}

export const SprintSelect: React.FC<SprintSelectProps> = ({ onStart }) => {
  const router = useRouter();
  const { showConfirm } = useConfirm();

  const { config, contentMetadata, contentName, setConfig } = useSprintStore();

  const [userProgress, setUserProgress] = useState<any>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMicHelpOpen, setIsMicHelpOpen] = useState(false);
  const [isHelpAccordionOpen, setIsHelpAccordionOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  const DEFAULT_TIME = SPRINT_TIME_OPTIONS[DEFAULT_SPRINT_TIME_KEY]?.value ?? 90;
  const DEFAULT_TYPE: SprintQuestionType = '0';

  const mode = config.mode || 'sprint';
  const selectedType = config.questionType || DEFAULT_TYPE;
  const selectedLevel = String(config.level);
  const selectedTimeLimitSec = config.timeLimitSec || DEFAULT_TIME;
  
  const isAssessmentMode = config.isAssessmentMode !== false;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isHintOpen, setIsHintOpen] = useState(false);

  const { micStatus, requestMicPermission } = useMicPermission();

  useEffect(() => {
    if (micStatus === 'denied') {
      setConfig({ isAssessmentMode: false });
    }
  }, [micStatus, setConfig]);

  useEffect(() => {
    const fetchProgress = async () => {
      const progRes = await getSprintProgressAction();
      if (progRes.success) {
        setUserProgress(progRes.data);
      }
    };
    fetchProgress();
  }, []);

  const isCorpus = contentMetadata?.sprint_type === '1';
  const hasLevel = resolveSprintHasLevel(contentMetadata);

  const isTypeSupported = useCallback((typeId: SprintQuestionType) => {
    if (!isCorpus || !contentMetadata?.supported_types) return true;
    const support = contentMetadata.supported_types;
    if (typeId === '0') return support.speed;
    if (typeId === '4') return support.structure;
    if (typeId === '5') return support.builders;
    if (typeId === '6') return support.mastery;
    return false;
  }, [isCorpus, contentMetadata]);

  const handleTypeChange = (typeId: SprintQuestionType) => {
    setConfig({
      questionType: typeId,
      level: hasLevel ? String(QUESTION_TYPES[typeId]?.minLevel ?? '0') : '1'
    });
  };

  const handleLevelChange = (level: string) => { setConfig({ level }); };
  const handleTimeLimitChange = (time: number) => { setConfig({ timeLimitSec: time }); };
  const handleModeChange = (nextMode: 'drill' | 'sprint') => { setConfig({ mode: nextMode }); };

  const sortedTypes = useMemo(() => Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no), []);
  const sortedTimes = useMemo(() => Object.values(SPRINT_TIME_OPTIONS).sort((a, b) => a.seq_no - b.seq_no), []);

  const currentTheme = useMemo(() => {
    if (isCorpus && contentMetadata?.theme) return contentMetadata.theme;
    return SPRINT_THEMES[`${selectedType}_${selectedLevel}`] || '標準テーマ設定';
  }, [isCorpus, contentMetadata, selectedType, selectedLevel]);

  const levelItems = useMemo(() => {
    const meta = QUESTION_TYPES[selectedType];
    if (!meta) return [];
    const clearedLevel = userProgress?.[meta.dbKey] ?? 0;
    const maxAllowed = clearedLevel + 1;
    const items = [];
    for (let i = meta.minLevel; i <= meta.maxLevel; i++) {
      items.push({ value: String(i), label: i === 0 ? 'Basic' : `Lv ${i}`, isLocked: i > meta.minLevel && i > maxAllowed });
    }
    return items;
  }, [selectedType, userProgress]);

  const handleWarmupAndRequestMic = async () => {
    setIsPreparing(true);
    try {
      setAudioSessionPlayAndRecord();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      await requestMicPermission();
    } catch (e) {
      console.warn("Mic permission denied or failed or cancelled:", e);
      const confirmed = await showConfirm(
        'マイクが許可されていません',
        '発話評価モードをOFFに変更し、脳内回答トレーニングに切り替えますか？',
        { variant: 'warning' }
      );
      if (confirmed) {
        setConfig({ isAssessmentMode: false, answerType: '0' });
      }
    } finally {
      setIsPreparing(false);
    }
  };

  const handleStartSubmit = async (answerType: SprintAnswerType = '0') => {
    setIsPreparing(true);
    setConfig({ answerType });

    onStart({
      mode,
      questionType: selectedType,
      level: selectedLevel,
      timeLimitSec: selectedTimeLimitSec,
      answerType: (mode === 'sprint' && selectedType === '0') ? answerType : '0',
      isAssessmentMode
    });
    setIsPreparing(false);
  };

  const isSpeedSelected = selectedType === '0';
  const currentHint = SPRINT_NOTES[selectedType] || '';

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-slate-100 flex items-center justify-center p-2 sm:p-4 overflow-hidden overscroll-none touch-none select-none text-slate-900">
      <main className="bg-white shadow-2xl w-full max-w-2xl h-full flex flex-col relative overflow-hidden rounded-[40px]">
        
      {/* 🌟 完全中央集約型のノイズレス・ヒーローヘッダー */}
      <div 
        onClick={() => setIsSettingsOpen(true)}
        className="shrink-0 pt-4 pb-5 w-full bg-white z-20 border-b border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.01)] relative flex flex-col items-center cursor-pointer hover:bg-slate-50/70 active:bg-slate-100/50 transition-colors duration-150 select-none group"
      >
        {/* 最上段レイヤー：ナビゲーションとメインラベル */}
        <div className="w-full flex items-center justify-between min-h-[40px] px-6">
          <div className="flex items-center gap-2 z-30">
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.back();
              }}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 shadow-3xs hover:bg-slate-100 hover:text-slate-600 active:scale-95 transition-all cursor-pointer"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push('/dashboard');
              }}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 shadow-3xs hover:bg-slate-100 hover:text-indigo-600 active:scale-95 transition-all cursor-pointer"
              title="ダッシュボードに戻る"
            >
              <Home size={18} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-0.5 rounded-full max-w-[60%] z-30">
            <span className="text-sm font-black text-indigo-600 truncate leading-none">
              {contentName || 'Gabby Blueprint'}
            </span>
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsSettingsOpen(true);
            }}
            className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 shadow-3xs hover:bg-slate-100 hover:text-indigo-600 active:scale-95 transition-all cursor-pointer z-30"
          >
            <Settings2 size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* コア情報を完全に中央へ数珠つなぎ配置 */}
        <div className="w-full relative mt-3.5 min-h-[32px] flex items-center justify-center px-6">
          {/* 🚀 改修: motion.divに layout 属性を持たせ、バッジ消失・出現時の横シフトを滑らかに補間 */}
          <motion.div layout className="w-max max-w-full flex items-center justify-center gap-2 text-center pointer-events-none px-2">
            
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-tight truncate group-hover:text-indigo-600 transition-colors">
              {getSprintTitle(selectedType, Number(selectedLevel), hasLevel)}
            </h2>

            {/* 🚀 改修: ドリルモード切り替え時にフェード＆横スライドしながら消滅するインタラクション */}
            <AnimatePresence mode="popLayout">
              {mode === 'sprint' && (
                <motion.span 
                  initial={{ opacity: 0, scale: 0.8, x: 12 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: 12 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                  className="text-[11px] font-mono font-black px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 shadow-3xs flex items-center gap-0.5 shrink-0 h-5 align-middle"
                >
                  <Timer size={12} className="text-amber-500" />
                  {selectedTimeLimitSec}s
                </motion.span>
              )}
            </AnimatePresence>

          </motion.div>
        </div>
      </div>

        {/* メインスペース */}
        <div className={cn("flex-1 min-h-0 flex flex-col", mode === 'sprint' ? "bg-indigo-50/30" : "bg-slate-50/50")}>
          <div className="flex-1 min-h-0 overflow-y-scroll px-6 py-4 overscroll-contain stable-gutter">
            <div className="w-full max-w-xl mx-auto space-y-4 pt-1 pb-6">

              {/* 🚀 改善版: 上下段のUIデザインを「タブ構造」で完全統一したモード選択セクション */}
              <div className="bg-white border border-slate-100 rounded-3xl p-3 shadow-3xs flex flex-col gap-4">
                
                {/* 1段目: トレーニングモード（上段タブ） */}
                <div className="space-y-2">
                  {/* 🚀 改修: ヘルプアイコンを右寄せから「小見出しのすぐ横」へインライン配置に変更 */}
                  <div className="flex items-center gap-1.5 pl-1 h-6">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">トレーニングモード</span>
                    <Dialog>
                      <DialogTrigger asChild>
                        <button className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full border bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100 hover:text-indigo-600 active:scale-95 transition-all cursor-pointer">
                          <HelpCircle size={13} strokeWidth={2.5} />
                        </button>
                      </DialogTrigger>
                      <DialogContent 
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        className="sm:max-w-sm border-none bg-white p-6 shadow-2xl rounded-2xl text-slate-900"
                      >
                        <DialogHeader><DialogTitle className="text-sm font-black text-slate-400 tracking-wider">モード解説</DialogTitle></DialogHeader>
                        <div className="space-y-4 mt-3">
                          <div className="space-y-1">
                            <h4 className="text-sm font-black text-indigo-600 flex items-center gap-1.5"><Zap size={14} className="fill-current text-indigo-500" /> スプリントモード</h4>
                            <p className="text-xs text-slate-600 font-bold leading-relaxed">制限時間内に一問一答でテンポよく回答を重ねる瞬発力強化モードです。</p>
                          </div>
                          <hr className="border-slate-100" />
                          <div className="space-y-1">
                            <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5"><Sliders size={14} /> ドリルモード</h4>
                            <p className="text-xs text-slate-600 font-bold leading-relaxed">自分のペースで英文を聞き、発話を繰り返す練習モードです。</p>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="bg-slate-100/80 p-1 rounded-xl grid grid-cols-2 gap-1 relative overflow-hidden isolate">
                    <button type="button" onClick={() => handleModeChange('sprint')} className={cn("relative py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-xs font-black z-10 outline-none select-none", mode === 'sprint' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600")}>
                      {mode === 'sprint' && <motion.div layoutId="activeModeBg" className="absolute inset-0 bg-white rounded-lg shadow-2xs border border-slate-200/40 -z-10" transition={{ type: "tween", ease: "easeInOut", duration: 0.2 }} />}
                      <Zap size={12} className={cn(mode === 'sprint' ? "fill-current text-amber-400" : "text-slate-400")} />
                      <span>スプリント</span>
                    </button>
                    <button type="button" onClick={() => handleModeChange('drill')} className={cn("relative py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-xs font-black z-10 outline-none select-none", mode === 'drill' ? "text-slate-900" : "text-slate-400 hover:text-slate-600")}>
                      {mode === 'drill' && <motion.div layoutId="activeModeBg" className="absolute inset-0 bg-white rounded-lg shadow-2xs border border-slate-200/40 -z-10" transition={{ type: "tween", ease: "easeInOut", duration: 0.2 }} />}
                      <Sliders size={12} strokeWidth={3} className={cn(mode === 'drill' ? "text-teal-500" : "text-slate-400")} />
                      <span>ドリル</span>
                    </button>
                  </div>
                </div>

                {/* 2段目: 発話評価モード */}
                <div className="space-y-2">
                  {/* 🚀 改修①: チェックアイコン ＋ 視認性を高めたテキストメッセージ（マイク権限OK）でアプリ設定との混同を完全に防ぐ */}
                  <div className="flex items-center gap-2 pl-1 h-5">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">発話評価</span>
                    {micStatus === 'granted' && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-100/70 shadow-3xs leading-none shrink-0 animate-fade-in whitespace-nowrap">
                        <Check size={10} strokeWidth={4} className="text-emerald-600 shrink-0" />
                        <span className="text-[10px] font-bold tracking-wider">マイク許可</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-100/80 p-1 rounded-xl grid grid-cols-2 gap-1 relative overflow-hidden isolate">
                    {/* 評価ONボタン */}
                    <button 
                      type="button" 
                      disabled={micStatus === 'denied'}
                      onClick={() => setConfig({ isAssessmentMode: true })} 
                      className={cn(
                        "relative py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-xs font-black z-10 outline-none select-none disabled:opacity-50 disabled:cursor-not-allowed", 
                        isAssessmentMode && micStatus !== 'denied' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      {isAssessmentMode && micStatus !== 'denied' && (
                        <motion.div layoutId="activeAssessBg" className="absolute inset-0 bg-white rounded-lg shadow-2xs border border-slate-200/40 -z-10" transition={{ type: "tween", ease: "easeInOut", duration: 0.2 }} />
                      )}
                      
                      {/* 🚀 改修②: 下部警告エリアのシグナルカラーと動的に同期。有効感・警告・ブロック状態を直感的に伝える */}
                      <Mic 
                        size={12} 
                        className={cn(
                          "transition-colors duration-200",
                          !isAssessmentMode ? "text-slate-400" : // 非アクティブ時
                          micStatus === 'granted' ? "text-emerald-500" : // 許可済みで有効
                          micStatus === 'prompt' ? "text-amber-500" : // 未許可（ブラウザのポップアップ誘導待ち）
                          "text-rose-500" // ブロック状態
                        )} 
                      />
                      <span>ON</span>
                    </button>

                    {/* 評価OFFボタン */}
                    <button 
                      type="button" 
                      onClick={() => setConfig({ isAssessmentMode: false })} 
                      className={cn(
                        "relative py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-xs font-black z-10 outline-none select-none", 
                        !isAssessmentMode || micStatus === 'denied' ? "text-slate-950" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      {(!isAssessmentMode || micStatus === 'denied') && (
                        <motion.div layoutId="activeAssessBg" className="absolute inset-0 bg-white rounded-lg shadow-2xs border border-slate-200/40 -z-10" transition={{ type: "tween", ease: "easeInOut", duration: 0.2 }} />
                      )}
                      <MicOff size={12} className={cn(!isAssessmentMode || micStatus === 'denied' ? "text-slate-600" : "text-slate-400")} />
                      <span>OFF</span>
                    </button>
                  </div>

                  {/* 下部の1行案内エリア: 既存の洗練された AnimatePresence ロジックを完全維持 */}
                  <AnimatePresence mode="wait">
                    {micStatus === 'denied' && (
                      <motion.div 
                        initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.15 }}
                        className="p-2 rounded-xl border flex items-center gap-2 text-[10px] font-bold tracking-tight leading-none bg-rose-50/60 border-rose-100 text-rose-700"
                      >
                        <MicOff size={12} className="shrink-0 text-rose-500" strokeWidth={2.5} />
                        <span>マイクがブロックされています。ブラウザ設定を確認してください。</span>
                      </motion.div>
                    )}

                    {micStatus === 'prompt' && isAssessmentMode && (
                      <motion.div 
                        initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.15 }}
                        className="p-2 rounded-xl border flex items-center gap-2 text-[10px] font-bold tracking-tight leading-none bg-amber-50/70 border-amber-100 text-amber-700"
                      >
                        <AlertTriangle size={12} className="shrink-0 text-amber-500" strokeWidth={2.5} />
                        <span>下部のボタンよりマイクの許可をしてください。</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 3段目: 詳細設定（種別・レベル・時間）への導線 */}
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-full flex items-center justify-between pl-1 pr-2 py-1.5 rounded-xl hover:bg-slate-50/80 active:scale-[0.99] transition-all group border-t border-slate-100/70 -mt-1 pt-2.5"
                >
                  <div className="flex items-center gap-1.5">
                    <Settings2 size={12} className="text-slate-400 group-hover:text-indigo-500 transition-colors" strokeWidth={2.5} />
                    <span className="text-[11px] font-black text-slate-500 group-hover:text-indigo-600 transition-colors">種別・レベル・時間を変更</span>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" strokeWidth={2.5} />
                </button>

              </div>

              {/* 出題テーマセクション */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-3xs overflow-hidden">
                <button type="button" onClick={() => setIsThemeOpen(!isThemeOpen)} className="w-full px-4 py-3.5 flex items-center justify-between text-left select-none active:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center"><BookOpen size={12} strokeWidth={2.5} /></div>
                    <span className="text-xs font-black text-slate-700">出題テーマを確認</span>
                  </div>
                  <ChevronDown size={14} className={cn("text-slate-400 transition-transform duration-200", isThemeOpen && "rotate-180")} />
                </button>
                <div className={cn("grid transition-all duration-200", isThemeOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden">
                    <div className="px-4 pb-4 pt-1 border-t border-slate-50/60">
                      <p className="text-xs font-bold text-slate-600 bg-slate-50/80 p-3 rounded-xl border border-slate-100">{currentTheme}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ヒント (Tips) */}
              <div className={cn("bg-white border rounded-2xl shadow-3xs overflow-hidden transition-all", currentHint ? "border-slate-100 opacity-100" : "border-slate-100 opacity-50 pointer-events-none")}>
                <button type="button" disabled={!currentHint} onClick={() => setIsHintOpen(!isHintOpen)} className="w-full px-4 py-3.5 flex items-center justify-between text-left select-none active:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", currentHint ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400")}><Lightbulb size={12} strokeWidth={2.5} /></div>
                    <span className="text-xs font-black text-slate-700">回答のヒント (Tips)</span>
                  </div>
                  <ChevronDown size={14} className={cn("text-slate-400 transition-transform duration-200", isHintOpen && "rotate-180")} />
                </button>
                <div className={cn("grid transition-all duration-200", isHintOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden">
                    <div className="px-4 pb-4 pt-1 border-t border-slate-50/60">
                      <p className="text-xs font-medium text-slate-600 bg-slate-50/80 p-3 rounded-xl border border-slate-100">{currentHint}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ヘルプアコーディオン */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-3xs overflow-hidden">
                <button type="button" onClick={() => setIsHelpAccordionOpen(!isHelpAccordionOpen)} className="w-full px-4 py-3.5 flex items-center justify-between text-left select-none active:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><HelpCircle size={12} strokeWidth={2.5} /></div>
                    <span className="text-xs font-black text-slate-700">ヘルプ</span>
                  </div>
                  <ChevronDown size={14} className={cn("text-slate-400 transition-transform duration-200", isHelpAccordionOpen && "rotate-180")} strokeWidth={2.5} />
                </button>
                <div className={cn("grid transition-all duration-200 ease-in-out", isHelpAccordionOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden">
                    <div className="px-4 pb-3 pt-1 border-t border-slate-50/60 flex flex-col gap-1">

                      <button type="button" onClick={() => setIsHelpOpen(true)} className="w-full flex items-center justify-between text-left py-2.5 px-2 hover:bg-slate-50/80 active:scale-[0.99] transition-all rounded-xl group">
                        <span className="text-[11px] sm:text-xs font-bold text-slate-600 truncate mr-4 group-hover:text-indigo-600 transition-colors">音声が聞こえない・認識しない場合</span>
                        <ChevronRight size={14} className="text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" strokeWidth={2.5} />
                      </button>
                      <button type="button" onClick={() => setIsMicHelpOpen(true)} className="w-full flex items-center justify-between text-left py-2.5 px-2 hover:bg-slate-50/80 active:scale-[0.99] transition-all rounded-xl group border-t border-slate-100/50 mt-0.5">
                        <span className="text-[11px] sm:text-xs font-bold text-slate-600 truncate mr-4 group-hover:text-indigo-600 transition-colors">マイクがブロックされて開始できない場合</span>
                        <ChevronRight size={14} className="text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* 下部確定エリア */}
        <div className="px-6 pt-4 shrink-0 bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.015)] z-20 flex flex-col justify-center">
          <div className="w-full max-w-xl mx-auto">
            {isAssessmentMode && micStatus === 'prompt' ? (
              <button
                type="button"
                onClick={handleWarmupAndRequestMic}
                disabled={isPreparing}
                className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.15em] shadow-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center border-none outline-none cursor-pointer"
              >
                {isPreparing ? (
                  <div className="flex items-center justify-center w-full h-full"><Loader2 className="h-4 w-4 animate-spin text-white" /></div>
                ) : (
                  <div className="flex items-center justify-center gap-2 h-full w-full leading-none">
                    <Mic size={14} className="text-indigo-200 shrink-0" />
                    <span>タップしてマイクを許可する</span>
                    <ArrowRight size={14} strokeWidth={3} className="shrink-0" />
                  </div>
                )}
              </button>
            ) : mode === 'sprint' && isSpeedSelected ? (
              <div className="grid grid-cols-2 gap-3 w-full">
                <button 
                  onClick={() => handleStartSubmit('0')} 
                  disabled={isPreparing} 
                  className="h-14 rounded-2xl font-black text-xs uppercase tracking-[0.1em] shadow-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center border-none outline-none cursor-pointer"
                >
                  {isPreparing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 h-full w-full leading-none">
                      <Zap size={14} className="fill-current text-amber-300 shrink-0" />
                      <span>YESで回答開始</span>
                    </div>
                  )}
                </button>
                <button 
                  onClick={() => handleStartSubmit('1')} 
                  disabled={isPreparing} 
                  className="h-14 rounded-2xl font-black text-xs uppercase tracking-[0.1em] shadow-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center border-none outline-none cursor-pointer"
                >
                  {isPreparing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 h-full w-full leading-none">
                      <Zap size={14} className="fill-current text-indigo-300 shrink-0" />
                      <span>NOで回答開始</span>
                    </div>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleStartSubmit('0')}
                disabled={isPreparing}
                className={cn(
                  "w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg transition-all flex items-center justify-center border-none outline-none text-white cursor-pointer",
                  mode === 'sprint' ? "bg-indigo-600 hover:bg-indigo-700" : "bg-slate-900 hover:bg-slate-800"
                )}
              >
                {isPreparing ? (
                  <div className="flex items-center justify-center w-full h-full"><Loader2 className="h-4 w-4 animate-spin text-white" /></div>
                ) : (
                  <div className="flex items-center justify-center gap-2 h-full w-full leading-none">
                    <span>{mode === 'sprint' ? 'スプリント' : 'ドリル'}を開始</span>
                    <ArrowRight size={14} strokeWidth={3} className="shrink-0" />
                  </div>
                )}
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
                    <button className="h-8 px-4 flex items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100/50 text-indigo-600 hover:bg-indigo-100/80 text-[10px] font-black tracking-wider transition-all active:scale-95 cursor-pointer">
                      閉じる
                    </button>
                  </DrawerClose>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 whitespace-nowrap">
                    {QUESTION_TYPES[selectedType]?.label}
                  </span>
                  {hasLevel && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 whitespace-nowrap">
                      {selectedLevel === '0' ? 'Basic' : `Lv ${selectedLevel}`}
                    </span>
                  )}
                  {mode === 'sprint' && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 font-mono whitespace-nowrap">
                      {selectedTimeLimitSec}s
                    </span>
                  )}
                </div>
              </DrawerHeader>
            </div>

            <div className="flex-1 relative min-h-0 overflow-hidden border-t border-slate-50 mt-6" data-vaul-no-drag>
              {/* 🚀 改修: ユーザー状況ロード中（null時）のガタつき（レイアウトシフト）を完全に抑制する美しいスケルトンをマッピング */}
              {userProgress === null ? (
                <div className="px-8 py-6 space-y-6 animate-pulse">
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-1/4" />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-12 bg-slate-50 rounded-xl" />
                      <div className="h-12 bg-slate-50 rounded-xl" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-1/4" />
                    <div className="grid grid-cols-4 gap-2">
                      <div className="h-10 bg-slate-50 rounded-xl" />
                      <div className="h-10 bg-slate-50 rounded-xl" />
                      <div className="h-10 bg-slate-50 rounded-xl" />
                      <div className="h-10 bg-slate-50 rounded-xl" />
                    </div>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-full w-full pr-2">
                  <div className="px-8 py-4 space-y-6 pb-32">
                    
                    {/* 01. 種別 */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">問題種別の選択</span>
                      <div className="grid grid-cols-2 gap-2">
                        {sortedTypes.map((type) => {
                          const isSelected = selectedType === type.value;
                          const isSupported = isTypeSupported(type.value);
                          return (
                            <button
                              type="button"
                              key={type.value}
                              disabled={!isSupported}
                              onClick={() => handleTypeChange(type.value)}
                              className={cn(
                                "h-12 rounded-xl border text-xs font-black relative transition-all disabled:opacity-65 flex flex-col items-center justify-center gap-0.5", 
                                isSelected 
                                  ? (mode === 'sprint' ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-900 border-slate-900 text-white") 
                                  : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50"
                              )}
                            >
                              <span>{type.label}</span>
                              {!isSupported && (
                                <div className="flex items-center gap-0.5 text-rose-500 whitespace-nowrap">
                                  <Lock size={9} strokeWidth={2.5} className="shrink-0" />
                                  <span className="text-[9px] font-bold tracking-normal leading-none">提供されていません</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 02. レベル */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">レベルの選択</span>
                      {hasLevel ? (
                        <div className="grid grid-cols-4 gap-2">
                          {levelItems.map((item) => {
                            const isSelected = selectedLevel === item.value;
                            const isLocked = item.isLocked;
                            return (
                              <button
                                type="button"
                                key={item.value}
                                disabled={isLocked}
                                onClick={() => handleLevelChange(item.value)}
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
                      ) : (
                        <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-center">
                          <p className="text-xs font-bold text-slate-400 leading-none">この教材にレベルの設定はありません</p>
                        </div>
                      )}
                    </div>

                    {/* 03. 制限時間 */}
                    {mode === 'sprint' && (
                      <div className="space-y-2">
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">制限時間の選択</span>
                        <div className="grid grid-cols-2 gap-2">
                          {sortedTimes.map((opt) => {
                            const isSelected = selectedTimeLimitSec === opt.value;
                            return (
                              <button
                                type="button"
                                key={opt.seq_no}
                                onClick={() => handleTimeLimitChange(opt.value)}
                                className={cn("p-3 rounded-xl border text-left transition-all flex items-center justify-between", isSelected ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10" : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50")}
                              >
                                <div>
                                  <div className="text-xs font-black">{opt.label}</div>
                                  <div className={cn("text-[10px] font-bold", isSelected ? "text-indigo-200" : "text-slate-400")}>{opt.desc}</div>
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
              )}
            </div>
          </DrawerContent>
        </Drawer>
        <AudioTroubleshootingDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />
        <MicTroubleshootingDialog open={isMicHelpOpen} onOpenChange={setIsMicHelpOpen} />
        <ConfirmContainer />
      </main>
    </div>
  );
};