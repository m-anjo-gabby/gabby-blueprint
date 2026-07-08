'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Lock, Zap, ChevronLeft, Sliders, Settings2, Settings, HelpCircle, Lightbulb, ArrowRight, ChevronDown, ChevronRight, Mic, MicOff, Loader2, BookOpen } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from 'framer-motion';
import { QUESTION_TYPES, SPRINT_TIME_OPTIONS, DEFAULT_SPRINT_TIME_KEY, type SprintQuestionType, type SprintAnswerType, type SprintConfig } from '@gabby/types/sprint';
import { SPRINT_THEMES, SPRINT_NOTES, getSprintTitle, setAudioSessionPlayAndRecord } from '@gabby/lib';
import { useMicPermission } from '@gabby/lib/hooks/useMicPermission';
import { createBrowserClient } from '@gabby/lib/supabase/client';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useSprintStore } from '@/stores/useSprintStore';
import { getSprintProgressAction } from '@/actions/sprintAction';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import ConfirmContainer from '@gabby/lib/components/common/ConfirmContainer';
import { AudioTroubleshootingDialog } from '@/components/common/AudioTroubleshootingDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// 🚀 トグルスイッチ用コンポーネント
const ToggleSwitch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none",
      checked ? "bg-indigo-600" : "bg-slate-200",
      disabled && "opacity-50 cursor-not-allowed"
    )}
  >
    <span
      className={cn(
        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
        checked ? "translate-x-5" : "translate-x-0"
      )}
    />
  </button>
);

interface SprintSelectProps {
  initialConfig?: {
    mode?: 'drill' | 'sprint';
    questionType?: SprintQuestionType;
    level?: string;
    timeLimitSec?: number;
    contentId?: string | null;
  };
  onStart: (config: SprintConfig & { answerType: SprintAnswerType; isAssessmentMode: boolean }) => void;
}

export const SprintSelect: React.FC<SprintSelectProps> = ({ initialConfig, onStart }) => {
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const supabase = useMemo(() => createBrowserClient(), []);

  const { config, contentMetadata, contentName, setConfig } = useSprintStore();

  const [userProgress, setUserProgress] = useState<any>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isHelpAccordionOpen, setIsHelpAccordionOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  const DEFAULT_TIME = SPRINT_TIME_OPTIONS[DEFAULT_SPRINT_TIME_KEY]?.value ?? 90;
  const DEFAULT_TYPE: SprintQuestionType = '0';

  const mode = config.mode || 'sprint';
  const selectedType = config.questionType || DEFAULT_TYPE;
  const selectedLevel = String(config.level);
  const selectedTimeLimitSec = config.timeLimitSec || DEFAULT_TIME;
  
  // 🚀 ストアから発話評価ON/OFFの状態をマッピング（未定義時はtrue想定）
  const isAssessmentMode = config.isAssessmentMode !== false;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isHintOpen, setIsHintOpen] = useState(false);

  const { micStatus, requestMicPermission } = useMicPermission();

  // 🚀 改修：マウント時・権限変更検知時、マイク権限が拒否（denied）の場合は強制的に評価OFFに変更不可にする
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
  const hasLevel = isCorpus ? contentMetadata?.has_level ?? true : true;

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

  // マイク評価ONの時のみ通る、許可プロンプト起動ウォームアップ関数
  const handleWarmupAndRequestMic = async () => {
    setIsPreparing(true);
    try {
      setAudioSessionPlayAndRecord();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      await requestMicPermission();
    } catch (e) {
      console.warn("Mic permission denied or failed or cancelled:", e);
      // プロンプトでキャンセルされた場合は直接実施画面に遷移させず、評価モードをOFFにするだけに変更
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
        
        {/* ヘッダー */}
        <div className="shrink-0 pt-5 pb-3 w-full bg-white z-20 border-b border-slate-50 relative flex items-center min-h-[72px]">
          <button onClick={() => router.back()} className="absolute left-6 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 shadow-3xs hover:bg-slate-100 hover:text-slate-600 active:scale-95 transition-all z-30">
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <div className="w-full pl-18 pr-6 flex flex-col items-center">
            <button onClick={() => setIsSettingsOpen(true)} className="w-full flex flex-col items-center py-1 px-2 rounded-2xl hover:bg-slate-50/80 active:scale-[0.99] transition-all group border border-transparent">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-0.5">{contentName || 'Current Target'}</span>
              <div className="flex items-center justify-center gap-1.5 w-full">
                <h1 className="text-base font-black text-slate-800 tracking-tight truncate text-center">{getSprintTitle(selectedType, Number(selectedLevel))}</h1>
                {mode === 'sprint' && <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100/50 text-indigo-700">{selectedTimeLimitSec}s</span>}
                <Settings2 size={13} className="text-slate-300 group-hover:text-indigo-500 group-hover:rotate-45 transition-all" strokeWidth={2.5} />
              </div>
            </button>
          </div>
        </div>

        {/* メインスペース */}
        <div className={cn("flex-1 min-h-0 flex flex-col", mode === 'sprint' ? "bg-indigo-50/30" : "bg-slate-50/50")}>
          {/* ガタつき防止：overflow-y-scrollによるスクロールバー領域の常時確保と、安定したパディング割り当て */}
          <div className="flex-1 min-h-0 overflow-y-scroll px-6 py-4 overscroll-contain stable-gutter">
            <div className="w-full max-w-xl mx-auto space-y-4 pt-2 pb-6">

              {/* モード選択 */}
              <div className="bg-white border border-slate-100 rounded-3xl shadow-3xs p-4 space-y-3">
                <div className="flex items-center justify-between pl-1">
                  <span className={cn("text-[10px] font-black uppercase tracking-wider", mode === 'sprint' ? "text-indigo-600" : "text-slate-700")}>モード選択</span>
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="h-5 w-5 flex items-center justify-center rounded-full text-xs border bg-slate-50 text-slate-500 border-slate-100"><HelpCircle size={11} strokeWidth={2.5} /></button>
                    </DialogTrigger>
                    <DialogContent className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border-none bg-white p-6 shadow-2xl rounded-2xl">
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
                <div className="bg-slate-100/80 p-1.5 rounded-2xl grid grid-cols-2 gap-1 relative overflow-hidden">
                  <button type="button" onClick={() => handleModeChange('sprint')} className={cn("relative py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs font-black z-10", mode === 'sprint' ? "text-indigo-600" : "text-slate-400")}>
                    {mode === 'sprint' && <motion.div layoutId="activeModeBg" className="absolute inset-0 bg-white rounded-xl shadow-xs border" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                    <Zap size={13} className={cn("relative z-10", mode === 'sprint' ? "fill-current text-amber-400" : "text-slate-400")} />
                    <span className="relative z-10">スプリント</span>
                  </button>
                  <button type="button" onClick={() => handleModeChange('drill')} className={cn("relative py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs font-black z-10", mode === 'drill' ? "text-slate-900" : "text-slate-400")}>
                    {mode === 'drill' && <motion.div layoutId="activeModeBg" className="absolute inset-0 bg-white rounded-xl shadow-xs border" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                    <Sliders size={13} strokeWidth={3} className={cn("relative z-10", mode === 'drill' ? "text-teal-500" : "text-slate-400")} />
                    <span className="relative z-10">ドリル</span>
                  </button>
                </div>
              </div>

              {/* 設定・発話・教材情報のコンテンツスタック */}
              <div className="space-y-4">
                <button type="button" onClick={() => setIsSettingsOpen(true)} className="w-full bg-white border border-slate-100 rounded-2xl shadow-3xs px-4 py-3.5 flex items-center justify-between text-left active:scale-[0.995] transition-all">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-slate-50 text-slate-600 flex items-center justify-center"><Settings2 size={12} strokeWidth={2.5} /></div>
                    <span className="text-xs font-black text-slate-700 truncate">トレーニング設定を変更</span>
                  </div>
                  <Settings size={12} className="text-slate-400" strokeWidth={2.5} />
                </button>

                {/* 発話評価セクション（常時オープンなフラット仕様。マイク許可状態（granted）かつONの場合は見出し横にバッジを表示） */}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-3xs p-4">
                  <div className="flex items-center justify-between select-none">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Mic size={12} strokeWidth={2.5} />
                      </div>
                      
                      {/* 見出しテキスト */}
                      <span className="text-xs font-black text-slate-700 truncate">発話評価</span>
                      
                      {/* 許可バッジ要件の反映。ON/OFFバッジを廃止し、マイク許可状態かつONの時のみ「マイク許可済み」バッジを表示 */}
                      {micStatus === 'granted' && isAssessmentMode && (
                        <span className="text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-100 shadow-3xs shrink-0 leading-none flex items-center justify-center">
                          マイク許可済み
                        </span>
                      )}
                    </div>
                    
                    {/* トグルスイッチ（マイク権限が拒否（denied）の場合は変更不可 disabled） */}
                    <div className="flex items-center shrink-0">
                      <ToggleSwitch 
                        checked={isAssessmentMode} 
                        disabled={micStatus === 'denied'} 
                        onChange={(val) => setConfig({ isAssessmentMode: val })} 
                      />
                    </div>
                  </div>

                  {/* マイク状態表示エリア（許可状態 granted の場合は非表示、未許可 prompt および 拒否 denied の場合はメッセージを読めるように常時表示） */}
                  <AnimatePresence mode="wait">
                    {micStatus !== 'granted' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        transition={{ duration: 0.15 }}
                        className="bg-slate-50/60 p-3 rounded-xl border border-slate-100/80 overflow-hidden"
                      >
                        {micStatus === 'prompt' && (
                          <div className="flex items-center gap-3 w-full">
                            <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100/50"><MicOff size={16} /></div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-black text-slate-800">マイクは未許可です</h4>
                              <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                                下部のボタンからマイクの許可をしてください。
                              </p>
                            </div>
                          </div>
                        )}

                        {micStatus === 'denied' && (
                          <div className="flex items-center gap-3 w-full">
                            <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100/50"><MicOff size={16} /></div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-black text-rose-700">マイクがブロックされています</h4>
                              <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                                ブラウザの設定からマイクの許可設定を「許可」へ戻すか、発話評価をOFFにしてトレーニングを開始してください。
                              </p>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 出題テーマ（元のデザインのまま独立したアコーディオンとして維持） */}
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

                {/* ヒント (Tips)（元のデザインのまま独立したアコーディオンとして維持） */}
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

                {/* 🚀 改修：注意文言エリア（ヘルプアコーディオンとインライン型案内） */}
                {/* 「ヘルプ」アコーディオン化し、展開時に「音声が聞こえない・認識しない場合」を1行で表示できるデザインにしています */}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-3xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsHelpAccordionOpen(!isHelpAccordionOpen)}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left select-none active:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <HelpCircle size={12} strokeWidth={2.5} />
                      </div>
                      <span className="text-xs font-black text-slate-700">ヘルプ</span>
                    </div>
                    <ChevronDown size={14} className={cn("text-slate-400 transition-transform duration-200", isHelpAccordionOpen && "rotate-180")} strokeWidth={2.5} />
                  </button>
                  <div className={cn("grid transition-all duration-200 ease-in-out", isHelpAccordionOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                    <div className="overflow-hidden">
                      <div className="px-4 pb-3.5 pt-1 border-t border-slate-50/60 flex flex-col">
                        <button
                          type="button"
                          onClick={() => setIsHelpOpen(true)}
                          className="w-full flex items-center justify-between text-left py-2 px-1.5 hover:bg-slate-50 active:scale-[0.99] transition-all rounded-xl group"
                        >
                          <span className="text-[11px] sm:text-xs font-bold text-slate-600 truncate mr-2">
                            音声が聞こえない・認識しない場合
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <span className="text-[9px] font-black text-indigo-600 group-hover:text-indigo-700">対処法を確認</span>
                            <ChevronRight size={10} className="text-indigo-600 group-hover:text-indigo-700" strokeWidth={2.5} />
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* 下部確定エリア（評価モードに関わらず開始ラベル文言を完全統一し、内部要素の垂直・水平方向の縦横中央配置を厳密に保証） */}
        <div className="px-6 pt-4 shrink-0 bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.015)] z-20 flex flex-col justify-center">
          <div className="w-full max-w-xl mx-auto">
            {isAssessmentMode && micStatus === 'prompt' ? (
              // 1. 発話評価ON ＆ マイク未許可の場合：マイク許可呼び出しアクション
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
              // 2. Speedスプリント時特有の左右選択型（評価モード状態に関係なくラベル表記は同じ）
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
              // 3. 通常のダイレクト教材開始（評価ONのgranted状態 ＆ 評価OFFモード共通・縦横垂直中央配置）
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
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700">
                    {QUESTION_TYPES[selectedType]?.label}
                  </span>
                  {hasLevel && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700">
                      {selectedLevel === '0' ? 'Basic' : `Lv ${selectedLevel}`}
                    </span>
                  )}
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
                              <div className="flex items-center gap-0.5 text-rose-500">
                                <Lock size={9} strokeWidth={2.5} />
                                <span className="text-[8px] font-bold tracking-normal leading-none">
                                  提供されていません
                                </span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 02. レベル */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">02. Target Level / ターゲットレベル</span>
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
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">03. Duration / 制限時間</span>
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
          </DrawerContent>
        </Drawer>
        <AudioTroubleshootingDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />
        <ConfirmContainer />
      </main>
    </div>
  );
};