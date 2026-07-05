'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Lock, Zap, ChevronLeft, Sliders, Edit3, BookOpen, HelpCircle, X, ArrowRight, VolumeX, ChevronDown, Settings2, Settings, ChevronRight, Mic, MicOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from 'framer-motion';
import { 
  QUESTION_TYPES, 
  SPRINT_TIME_OPTIONS, 
  DEFAULT_SPRINT_TIME_KEY,
  type SprintQuestionType,
  type SprintAnswerType,
  type SprintConfig,
} from '@gabby/types/sprint';
import { SPRINT_THEMES, SPRINT_NOTES, getSprintTitle, setAudioSessionPlayback } from '@gabby/lib';
import { useMicPermission } from '@gabby/lib/hooks/useMicPermission';

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
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import ConfirmContainer from '@gabby/lib/components/common/ConfirmContainer';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SprintSelectProps {
  initialConfig?: {
    mode?: 'drill' | 'sprint';
    questionType?: SprintQuestionType;
    level?: string;
    timeLimitSec?: number;
    contentId?: string | null;
  };
  onStart: (config: SprintConfig & { answerType: SprintAnswerType }) => void;
}

export const SprintSelect: React.FC<SprintSelectProps> = ({ initialConfig, onStart }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showConfirm } = useConfirm();

  // 🚀 開始画面マウント時に強制的にオーディオセッションをスピーカー出力(playback)へ戻し、TTSをキャンセルしてクリア状態にする
  useEffect(() => {
    setAudioSessionPlayback();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // ストアから設定更新アクションと現在のconfigを取得
  const { config, contentMetadata, contentName, setConfig } = useSprintStore();

  const [userProgress, setUserProgress] = useState<any>(null);

  // マスタからデフォルトキーに対応する制限秒数を動的に参照
  const DEFAULT_TIME = SPRINT_TIME_OPTIONS[DEFAULT_SPRINT_TIME_KEY]?.value ?? 90;
  const DEFAULT_TYPE: SprintQuestionType = '0';

  // ─── 📦 Zustandストアから取得した値をそのまま表示（ローカルuseStateは排除） ───
  const mode = config.mode || 'sprint';
  const selectedType = config.questionType || DEFAULT_TYPE;
  const selectedLevel = String(config.level);
  const selectedTimeLimitSec = config.timeLimitSec || DEFAULT_TIME;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isHintOpen, setIsHintOpen] = useState(false);
  const [isMicTestOpen, setIsMicTestOpen] = useState(false);

  // マイク制御（権限確認・テスト）を専用フックに委譲
  const {
    micStatus,
    isTestingMic,
    testTranscript,
    micTestSuccess,
    micTestError,
    startMicTest,
    stopMicTest,
  } = useMicPermission();

  // マイクテスト状態の見出しバッジ表示ヘルパー
  const micHeaderBadge = useMemo(() => {
    if (micStatus === 'granted') {
      if (micTestSuccess) {
        return { label: 'チェック完了', className: 'bg-emerald-50 text-emerald-700 border-emerald-100/50' };
      }
      return { label: '許可済み', className: 'bg-indigo-50 text-indigo-700 border-indigo-100/50' };
    }
    if (micStatus === 'denied') {
      return { label: 'ブロック中', className: 'bg-rose-50 text-rose-700 border-rose-100/50' };
    }
    if (micStatus === 'prompt') {
      return { label: '未許可', className: 'bg-amber-50 text-amber-700 border-amber-100/50' };
    }
    return { label: '確認中', className: 'bg-slate-50 text-slate-400 border-slate-100' };
  }, [micStatus, micTestSuccess]);

  // アコーディオンが閉じられたらマイクテストを自動クリーンアップ
  useEffect(() => {
    if (!isMicTestOpen && isTestingMic) {
      const timer = setTimeout(() => {
        stopMicTest();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isMicTestOpen, isTestingMic, stopMicTest]);

  // 権限が未許可・ブロック状態の場合はアコーディオンを自動展開する
  useEffect(() => {
    if (micStatus === 'prompt' || micStatus === 'denied') {
      const timer = setTimeout(() => {
        setIsMicTestOpen(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [micStatus]);

  // ユーザー進捗の取得
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

  const handleLevelChange = (level: string) => {
    setConfig({ level });
  };

  const handleTimeLimitChange = (time: number) => {
    setConfig({ timeLimitSec: time });
  };

  const handleModeChange = (nextMode: 'drill' | 'sprint') => {
    setConfig({ mode: nextMode });
  };

  const sortedTypes = useMemo(() => Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no), []);
  const sortedTimes = useMemo(() => Object.values(SPRINT_TIME_OPTIONS).sort((a, b) => a.seq_no - b.seq_no), []);

  const currentTheme = useMemo(() => {
    if (isCorpus && contentMetadata?.theme) {
      return contentMetadata.theme;
    }
    const key = `${selectedType}_${selectedLevel}`;
    return SPRINT_THEMES[key] || '標準テーマ設定';
  }, [isCorpus, contentMetadata, selectedType, selectedLevel]);

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

  const handleStartSubmit = async (answerType: SprintAnswerType = '0') => {
    // スプリント開始時に動作中のマイクテストがあれば確実に停止させる
    stopMicTest();

    if (mode === 'sprint' && micStatus !== 'granted') {
      const confirmed = await showConfirm(
        'マイクが許可されていません',
        '発話の評価を行わずにスプリントを開始しますか？（スキップボタンで発話をパスしながら進めることになります）',
        { variant: 'info' }
      );
      if (!confirmed) {
        return;
      }
    }

    if (typeof window !== 'undefined') {
      const audio = new Audio();
      audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
      audio.play().catch(() => {});
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }

    // ストア側のanswerTypeも確定タイミングで同期
    setConfig({ answerType });

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
        <div className="shrink-0 pt-5 pb-3 w-full overflow-hidden bg-white z-20 border-b border-slate-50 shadow-xs relative flex items-center min-h-[72px]">
          
          <button 
            onClick={() => router.back()} 
            className="absolute left-6 top-1/2 -translate-y-1/2 h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 shadow-3xs hover:bg-slate-100 hover:text-slate-600 active:scale-95 transition-all z-30"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>

          <div className="w-full pl-18 pr-6 flex flex-col items-center">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-full flex flex-col items-center py-1 px-2 rounded-2xl hover:bg-slate-50/80 active:scale-[0.99] transition-all group border border-transparent hover:border-slate-100/80"
            >
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-0.5">
                  {contentName || 'Current Target'}
                </span>
              </div>
              
              <div className="flex items-center justify-center gap-1.5 w-full">
                <h1 className="text-base font-black text-slate-800 tracking-tight leading-tight truncate text-center">
                  {getSprintTitle(selectedType, Number(selectedLevel))}
                </h1>
                {mode === 'sprint' && (
                  <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100/50 text-indigo-700 leading-none shrink-0">
                    {selectedTimeLimitSec}s
                  </span>
                )}
                <Settings2 size={13} className="text-slate-300 group-hover:text-indigo-500 group-hover:rotate-45 transition-all shrink-0" strokeWidth={2.5} />
              </div>
            </button>
          </div>
        </div>

        {/* メイン空間コンテナ */}
        <div className={cn(
          "flex-1 min-h-0 flex flex-col transition-colors duration-300",
          mode === 'sprint' ? "bg-indigo-50/30" : "bg-slate-50/50"
        )}>
          
          {/* メインスクロールコンテンツ */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 overscroll-contain">
            <div className="w-full max-w-xl mx-auto space-y-4 pt-2 pb-6">

              {/* ⚡ 改善されたモード選択セクション（一体型カード構造） */}
              <div className="bg-white border border-slate-100 rounded-3xl shadow-3xs p-4 space-y-3">
                <div className="flex items-center justify-between pl-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-wider transition-colors",
                      mode === 'sprint' ? "text-indigo-600" : "text-slate-700"
                    )}>
                      モード選択
                    </span>
                  </div>
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className={cn(
                        "h-5 w-5 flex items-center justify-center rounded-full text-xs transition-colors border shadow-3xs",
                        mode === 'sprint' ? "bg-indigo-50 text-indigo-500 border-indigo-100/50 hover:bg-indigo-100" : "bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100"
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
                          モード解説
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

                {/* ネイティブライクなスライド式トグル */}
                <div className="bg-slate-100/80 p-1.5 rounded-2xl grid grid-cols-2 gap-1 relative overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleModeChange('sprint')}
                    className={cn(
                      "relative py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs font-black z-10",
                      mode === 'sprint' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {mode === 'sprint' && (
                      <motion.div
                        layoutId="activeModeBg"
                        className="absolute inset-0 bg-white rounded-xl shadow-xs border border-indigo-100/20"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <Zap size={13} className={cn("relative z-10 transition-colors", mode === 'sprint' ? "fill-current text-amber-400" : "text-slate-400")} />
                    <span className="relative z-10">スプリント</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleModeChange('drill')}
                    className={cn(
                      "relative py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs font-black z-10",
                      mode === 'drill' ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {mode === 'drill' && (
                      <motion.div
                        layoutId="activeModeBg"
                        className="absolute inset-0 bg-white rounded-xl shadow-xs border border-slate-200/50"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <Sliders size={13} strokeWidth={3} className={cn("relative z-10 transition-colors", mode === 'drill' ? "text-teal-500" : "text-slate-400")} />
                    <span className="relative z-10">ドリル</span>
                  </button>
                </div>
              </div>

              {/* スキップについての注意文言 */}
              {mode === 'sprint' && (
                <div className="p-3 rounded-2xl border border-amber-100/40 bg-amber-50/70 text-amber-900 shadow-3xs flex items-start gap-2.5 select-none animate-in fade-in slide-in-from-top-2 duration-200">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="text-[11px] font-bold leading-normal">
                    発話できない環境の場合、<span className="underline decoration-amber-400 decoration-2 font-black">スキップボタン</span>で発話評価をパスして次に進めます。
                  </p>
                </div>
              )}

              {/* 統合アコーディオンセクション */}
              <div className="space-y-2">

                {/* ⚙️ トレーニング設定・ボタン */}
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-full bg-white border border-slate-100 rounded-2xl shadow-3xs px-4 py-3.5 flex items-center justify-between text-left active:bg-slate-50/50 transition-all active:scale-[0.995]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
                      <Settings2 size={12} strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0 flex flex-col">
                      <span className="text-xs font-black text-slate-700 truncate">トレーニング設定を変更</span>
                    </div>
                  </div>
                  <Settings size={12} className="text-slate-400 shrink-0" strokeWidth={2.5} />
                </button>

                {/* 🎙️ マイクチェック・アコーディオン */}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-3xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsMicTestOpen(!isMicTestOpen)}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left select-none active:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <Mic size={12} strokeWidth={2.5} />
                      </div>
                      <span className="text-xs font-black text-slate-700 truncate">マイクチェック</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("text-[9px] font-black px-2 py-0.5 rounded border shadow-3xs leading-none", micHeaderBadge.className)}>
                        {micHeaderBadge.label}
                      </span>
                      <ChevronDown size={14} className={cn("text-slate-400 transition-transform duration-200", isMicTestOpen && "rotate-180")} strokeWidth={2.5} />
                    </div>
                  </button>
                  
                  <div className={cn(
                    "grid transition-all duration-200 ease-in-out",
                    isMicTestOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}>
                    <div className="overflow-hidden">
                      <div className="px-4 pb-4 pt-1 border-t border-slate-50/60">
                        <div className="flex flex-col gap-3 pt-2">
                          <AnimatePresence mode="wait">
                            {/* 1. 未許可 (prompt) */}
                            {micStatus === 'prompt' && (
                              <motion.div 
                                key="prompt"
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="flex items-center justify-between gap-3 py-1 w-full"
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                                    <MicOff size={18} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h4 className="text-xs font-black text-slate-800">マイクの許可が必要です</h4>
                                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">発話テストを開始してマイクを許可してください。</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startMicTest();
                                  }}
                                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black transition-all shrink-0 shadow-sm shadow-indigo-600/10 active:scale-95"
                                >
                                  テスト開始
                                </button>
                              </motion.div>
                            )}

                            {/* 2. ブロック (denied) */}
                            {micStatus === 'denied' && (
                              <motion.div 
                                key="denied"
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="flex items-center gap-3 py-1"
                              >
                                <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                  <MicOff size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <h4 className="text-xs font-black text-rose-700">マイクがブロックされています</h4>
                                    <Dialog>
                                      <DialogTrigger asChild>
                                        <button 
                                          type="button"
                                          className="h-4.5 w-4.5 flex items-center justify-center rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors cursor-pointer shrink-0"
                                        >
                                          <HelpCircle size={11} strokeWidth={2.5} />
                                        </button>
                                      </DialogTrigger>
                                      <DialogContent
                                        onOpenAutoFocus={(e) => e.preventDefault()}
                                        className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border-none bg-white p-6 shadow-2xl duration-200 rounded-2xl text-slate-900 outline-none"
                                      >
                                        <DialogHeader>
                                          <DialogTitle className="text-sm font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            マイク設定ガイド
                                          </DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4 mt-3 text-xs leading-relaxed text-slate-600">
                                          <div className="space-y-1">
                                            <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                                              1. ブラウザでの権限設定
                                            </h4>
                                            <p className="font-bold">
                                              アドレスバーの左端にある鍵マークや設定アイコンをタップし、<strong>「マイク」の権限が「許可」</strong>になっているかご確認ください。
                                            </p>
                                          </div>
                                          <hr className="border-slate-100" />
                                          <div className="space-y-1">
                                            <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                                              2. 拒否された状態を解除する方法
                                            </h4>
                                            <ul className="list-disc pl-4 space-y-1 font-bold">
                                              <li><strong>iOS (Safari):</strong> 設定アプリ ➔ Safari ➔ マイク を開き、「確認」または「許可」を選択します。</li>
                                              <li><strong>iOS/Android (Chrome):</strong> アドレスバーの鍵アイコン ➔ 「サイトの設定」または「権限」から「許可」に変更します。</li>
                                              <li><strong>PC:</strong> アドレスバーの鍵マークをクリックし、マイクを「許可」にしてページを再読み込みします。</li>
                                            </ul>
                                          </div>
                                        </div>
                                      </DialogContent>
                                    </Dialog>
                                  </div>
                                  <p className="text-[10px] font-bold text-slate-500 mt-0.5">発話機能を使うにはブラウザやOSの設定からマイクを許可してください。</p>
                                </div>
                              </motion.div>
                            )}

                            {/* 3. 許可済み (granted) で各種テスト状態 */}
                            {micStatus === 'granted' && (
                              <motion.div 
                                key="granted-container"
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="flex flex-col gap-3 w-full"
                              >
                                {isTestingMic && (
                                  <div className="flex items-center justify-between gap-3 py-1">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div className="relative h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                                        <motion.div 
                                          className="absolute inset-0 rounded-xl bg-indigo-600"
                                          animate={{ scale: [1, 1.4, 1] }}
                                          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                                          style={{ opacity: 0.3 }}
                                        />
                                        <Mic size={18} className="relative z-10" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <h4 className="text-xs font-black text-indigo-700">音声を認識中...</h4>
                                        <p className="text-[10px] font-bold text-slate-500 mt-0.5 truncate">
                                          {testTranscript ? `「${testTranscript}」` : "マイクに向かって『Hello』などと話してください"}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        stopMicTest();
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black transition-all shrink-0"
                                    >
                                      キャンセル
                                    </button>
                                  </div>
                                )}

                                {!isTestingMic && micTestSuccess && (
                                  <div className="flex items-center justify-between gap-3 py-1">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                        <CheckCircle2 size={18} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <h4 className="text-xs font-black text-emerald-700">マイクチェック完了！</h4>
                                        <p className="text-[10px] font-bold text-emerald-600/90 mt-0.5 truncate">
                                          発話を確認できました（「{testTranscript}」）
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startMicTest();
                                      }}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100/50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-black transition-all shrink-0"
                                    >
                                      <RefreshCw size={10} />
                                      再テスト
                                    </button>
                                  </div>
                                )}

                                {!isTestingMic && !micTestSuccess && micTestError && (
                                  <div className="flex items-center justify-between gap-3 py-1">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                        <AlertCircle size={18} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <h4 className="text-xs font-black text-rose-700">聞き取りに失敗しました</h4>
                                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">声が小さすぎるか、マイクが正しく接続されていない可能性があります。</p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startMicTest();
                                      }}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black transition-all shrink-0 shadow-sm"
                                    >
                                      <RefreshCw size={10} />
                                      再試行
                                    </button>
                                  </div>
                                )}

                                {!isTestingMic && !micTestSuccess && !micTestError && (
                                  <div className="flex items-center justify-between gap-3 py-1">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                                        <Mic size={18} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <h4 className="text-xs font-black text-slate-700">マイクは許可されています</h4>
                                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">正しく発音判定ができるか、発話テストを行いましょう。</p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startMicTest();
                                      }}
                                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black transition-all shrink-0 shadow-sm shadow-indigo-600/10 active:scale-95"
                                    >
                                      テスト開始
                                    </button>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

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
        <ConfirmContainer />
      </main>
    </div>
  );
};