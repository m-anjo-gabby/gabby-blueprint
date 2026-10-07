'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Lock, ChevronLeft, Sliders, HelpCircle, Lightbulb, ArrowRight, ChevronDown, ChevronRight, Mic, MicOff, Loader2, BookOpen, Settings2, AlertTriangle, Timer, Zap, Home } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from 'framer-motion';
import { QUESTION_TYPES, SPRINT_TIME_OPTIONS, DEFAULT_SPRINT_TIME_KEY, type SprintQuestionType, type SprintAnswerType, type SprintConfig } from '@gabby/types/sprint';
import { SPRINT_THEMES, SPRINT_NOTES, getSprintTitle, resolveSprintHasLevel, isSprintLevelSelectable, hasSprintQuestionsForType, isSprintLevelAvailable, pickSprintLevel } from '@gabby/lib';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useMicPermission } from '@gabby/lib/hooks/useMicPermission';
import { unlockAudio } from '@gabby/lib/audio/core/audioRuntime';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useSprintStore } from '@/stores/useSprintStore';
import type { StudentSprintProgress } from '@gabby/types/coachStudent';
import { getSprintProgressAction } from '@/actions/sprintAction';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import ConfirmContainer from '@gabby/lib/components/common/ConfirmContainer';
import { AudioTroubleshootingDialog } from '@/components/help/AudioTroubleshootingDialog';
import { MicTroubleshootingDialog } from '@/components/help/MicTroubleshootingDialog';
import { SPRINT_MODE_LABEL } from '@gabby/lib/content/ui';
import { ImmersiveBody, ImmersivePanel } from '@/components/shell/PageFrames';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface SprintSelectProps {
  onStart: (config: SprintConfig & { answerType: SprintAnswerType; isAssessmentMode: boolean }) => void;
}

export const SprintSelect: React.FC<SprintSelectProps> = ({ onStart }) => {
  const router = useRouter();
  const { showConfirm } = useConfirm();

  const { showToast } = useToast();

  const { config, contentMetadata, contentName, availableLevels, setConfig } = useSprintStore();

  // undefined = 取得中 / null = 進捗行なし・取得失敗（到達レベル0・レベル管理ありとして扱う）
  const [userProgress, setUserProgress] = useState<StudentSprintProgress | null | undefined>(undefined);
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
  const [isThemeTipsOpen, setIsThemeTipsOpen] = useState(false);

  const { micStatus, requestMicPermission } = useMicPermission();

  // 🚀 改修: メインエリアのスクロール残量を検知し、上下フェードマスクの表示を制御
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [mainScrollState, setMainScrollState] = useState({ top: false, bottom: false });

  const updateMainScrollState = useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    setMainScrollState({
      top: el.scrollTop > 4,
      bottom: el.scrollHeight - el.scrollTop - el.clientHeight > 4,
    });
  }, []);

  // 🚀 改修: 設定ドロワー内スクロールエリア(Radix ScrollArea)のフェードマスク制御
  const drawerScrollWrapRef = useRef<HTMLDivElement>(null);
  const [drawerScrollState, setDrawerScrollState] = useState({ top: false, bottom: false });

  const updateDrawerScrollState = useCallback(() => {
    const viewport = drawerScrollWrapRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    setDrawerScrollState({
      top: viewport.scrollTop > 4,
      bottom: viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 4,
    });
  }, []);

  useEffect(() => {
    if (micStatus === 'denied') {
      setConfig({ isAssessmentMode: false });
    }
  }, [micStatus, setConfig]);

  useEffect(() => {
    updateMainScrollState();
  }, [mode, isAssessmentMode, micStatus, isHelpAccordionOpen, updateMainScrollState]);

  useEffect(() => {
    if (!isSettingsOpen || userProgress === undefined) return;
    const viewport = drawerScrollWrapRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    updateDrawerScrollState();
    viewport.addEventListener('scroll', updateDrawerScrollState);
    return () => viewport.removeEventListener('scroll', updateDrawerScrollState);
  }, [isSettingsOpen, userProgress, updateDrawerScrollState]);

  useEffect(() => {
    const fetchProgress = async () => {
      const progRes = await getSprintProgressAction();
      setUserProgress(progRes.success ? (progRes.data as StudentSprintProgress | null) : null);
    };
    fetchProgress();
  }, []);

  const isCorpus = contentMetadata?.sprint_type === '1';
  const hasLevel = resolveSprintHasLevel(contentMetadata);

  useEffect(() => {
    if (!isSettingsOpen || userProgress === undefined) return;
    updateDrawerScrollState();
  }, [isSettingsOpen, userProgress, mode, selectedType, hasLevel, updateDrawerScrollState]);

  const isTypeSupported = useCallback((typeId: SprintQuestionType) => {
    if (!hasSprintQuestionsForType(availableLevels, typeId)) return false;
    if (!isCorpus || !contentMetadata?.supported_types) return true;
    const support = contentMetadata.supported_types;
    if (typeId === '0') return support.speed;
    if (typeId === '4') return support.structure;
    if (typeId === '5') return support.builders;
    if (typeId === '6') return support.mastery;
    return false;
  }, [isCorpus, contentMetadata, availableLevels]);

  const pickLevel = useCallback((typeId: SprintQuestionType, preferred?: number) => pickSprintLevel(typeId, {
    hasLevel,
    availableLevels,
    isSelectable: (lv) => isSprintLevelSelectable(typeId, lv, userProgress),
    preferred,
  }), [hasLevel, availableLevels, userProgress]);

  const handleTypeChange = (typeId: SprintQuestionType) => {
    setConfig({ questionType: typeId, level: String(pickLevel(typeId)) });
  };

  // 前回の設定・URL指定のレベルが「問題なし」または「未到達」の場合は、選べるレベルに補正する（到達レベルの取得後）
  useEffect(() => {
    if (userProgress === undefined) return;
    const picked = String(pickLevel(selectedType, Number(selectedLevel)));
    if (picked !== selectedLevel) setConfig({ level: picked });
  }, [userProgress, pickLevel, selectedType, selectedLevel, setConfig]);

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
    const items = [];
    for (let i = meta.minLevel; i <= meta.maxLevel; i++) {
      // 問題の無いレベルは出さない（コーパス教材は特定のレベルにしか問題が無いことがある）
      if (!isSprintLevelAvailable(availableLevels, selectedType, i)) continue;
      items.push({ value: String(i), label: i === 0 ? 'Basic' : `Lv ${i}`, isLocked: !isSprintLevelSelectable(selectedType, i, userProgress) });
    }
    return items;
  }, [selectedType, userProgress, availableLevels]);

  const handleWarmupAndRequestMic = async () => {
    setIsPreparing(true);
    try {
      // requestMicPermission はタップの同期区間の先頭で getUserMedia を呼び、セッション切り替えも内包する
      const granted = await requestMicPermission();
      if (granted) return;
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
    // 🔊 開始のタップの中で音声をアンロック・復旧する（結果画面での放置等で中断したままでも、1問目から鳴らす）。
    // iOS はタップの同期区間でしか AudioContext を確実に再開・作り直しできないため、await より前に呼ぶ
    void unlockAudio();
    // 選べない種別・レベルのまま開始しない（すべて未到達の種別等）
    const isLevelUsable = !hasLevel || userProgress === undefined || levelItems.some((item) => item.value === selectedLevel && !item.isLocked);
    if (!isTypeSupported(selectedType) || !isLevelUsable) {
      showToast('選択中の種別・レベルでは開始できません。種別・レベルを変更してください。', 'error');
      setIsSettingsOpen(true);
      return;
    }
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
    <ImmersivePanel as="main" className="overscroll-none select-none">
        
      {/* 🌟 完全中央集約型のノイズレス・ヒーローヘッダー */}
      <div 
        onClick={() => setIsSettingsOpen(true)}
        className="shrink-0 pt-4 pb-5 w-full bg-white z-20 border-b border-line/60 shadow-[0_1px_3px_rgba(0,0,0,0.01)] relative flex flex-col items-center cursor-pointer hover:bg-canvas/70 active:bg-canvas/50 transition-colors duration-150 select-none group"
      >
        {/* 最上段レイヤー：ナビゲーションとメインラベル */}
        <div className="w-full flex items-center justify-between min-h-[40px] px-6">
          <div className="flex items-center gap-2 z-30">
            <button
              onClick={(e) => {
                e.stopPropagation();
                // 選択→実施→結果の間は履歴を置き換えて移動するため、1つ戻ると入口（教材一覧・ホーム等）に戻る。
                // URLを直接開いた等で戻る先が無い場合は教材一覧へ
                if (window.history.length > 1) router.back();
                else router.push('/library');
              }}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-canvas text-ink-subtle border border-line/60 shadow-3xs hover:bg-canvas hover:text-ink-soft active:scale-95 transition-all cursor-pointer"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push('/dashboard');
              }}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-canvas text-ink-subtle border border-line/60 shadow-3xs hover:bg-canvas hover:text-brand active:scale-95 transition-all cursor-pointer"
              title="ダッシュボードに戻る"
            >
              <Home size={18} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-canvas/80 px-2.5 py-0.5 rounded-full max-w-[60%] z-30">
            <span className="text-sm font-bold text-brand truncate leading-none">
              {contentName || 'Gabby Blueprint'}
            </span>
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsSettingsOpen(true);
            }}
            className="h-9 w-9 flex items-center justify-center rounded-xl bg-canvas text-ink-subtle border border-line/60 shadow-3xs hover:bg-canvas hover:text-brand active:scale-95 transition-all cursor-pointer z-30"
          >
            <Settings2 size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* コア情報を完全に中央へ数珠つなぎ配置 */}
        <div className="w-full relative mt-3.5 min-h-[32px] flex items-center justify-center px-6">
          {/* 🚀 改修: motion.divに layout 属性を持たせ、バッジ消失・出現時の横シフトを滑らかに補間 */}
          <motion.div layout className="w-max max-w-full flex items-center justify-center gap-2 text-center pointer-events-none px-2">
            
            <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight leading-tight truncate group-hover:text-brand transition-colors">
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
                  className="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 shadow-3xs flex items-center gap-0.5 shrink-0 h-6 align-middle"
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
        <div className={cn("flex-1 min-h-0 flex flex-col relative", mode === 'sprint' ? "bg-brand-50/30" : "bg-canvas/50")}>
          {/* 🚀 改修: スクロール上端フェードマスク(残量がある時のみ表示) */}
          <div
            aria-hidden
            className={cn(
              "absolute top-0 inset-x-0 h-7 z-10 pointer-events-none bg-linear-to-b transition-opacity duration-200",
              mode === 'sprint' ? "from-brand-50" : "from-canvas",
              "to-transparent",
              mainScrollState.top ? "opacity-100" : "opacity-0"
            )}
          />
          <ImmersiveBody
            ref={mainScrollRef}
            onScroll={updateMainScrollState}
            className="overflow-y-scroll px-6 py-4 stable-gutter"
          >
            <div className="w-full max-w-xl mx-auto space-y-4 pt-1 pb-6">

              {/* 🚀 改修: モード選択カードを役割ごとに分割し、タップ対象の境界を明確化 */}
              <div className="space-y-3">

                {/* カードA: トレーニングモード */}
                <div className="bg-white border border-line/60 rounded-card p-3 shadow-3xs space-y-2">
                  <div className="flex items-center gap-1.5 pl-1 h-6">
                    <span className="text-xs font-bold text-ink-muted whitespace-nowrap">トレーニングモード</span>
                    <Dialog>
                      <DialogTrigger asChild>
                        <button type="button" aria-label="モードの説明" className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full border bg-canvas text-ink-subtle border-line hover:bg-brand-soft hover:text-brand active:scale-95 transition-all cursor-pointer">
                          <HelpCircle size={13} strokeWidth={2.5} />
                        </button>
                      </DialogTrigger>
                      <DialogContent
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        className="sm:max-w-sm border-none bg-surface p-6 shadow-2xl rounded-card text-ink"
                      >
                        <DialogHeader><DialogTitle className="text-sm font-bold text-ink-muted">モードの説明</DialogTitle></DialogHeader>
                        <div className="space-y-4 mt-3">
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-brand flex items-center gap-1.5"><Zap size={14} className="fill-current text-brand-500" /> {SPRINT_MODE_LABEL.sprint}</h4>
                            <p className="text-xs text-ink-soft leading-relaxed">制限時間内に、一問一答でテンポよく回答を重ねて瞬発力を鍛えます。何問解けるかに挑戦しましょう。</p>
                          </div>
                          <hr className="border-line" />
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-ink flex items-center gap-1.5"><Sliders size={14} /> {SPRINT_MODE_LABEL.drill}</h4>
                            <p className="text-xs text-ink-soft leading-relaxed">時間無制限で、自分のペースで英文を聞き、発話を繰り返して練習します。</p>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="bg-line/70 p-1 rounded-xl grid grid-cols-2 gap-1 relative overflow-hidden isolate">
                    <button type="button" onClick={() => handleModeChange('sprint')} className={cn("relative py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-xs font-bold z-10 outline-none select-none", mode === 'sprint' ? "text-brand" : "text-ink-subtle hover:text-ink-soft")}>
                      {mode === 'sprint' && <motion.div layoutId="activeModeBg" className="absolute inset-0 bg-white rounded-lg shadow-xs border border-line -z-10" transition={{ type: "tween", ease: "easeInOut", duration: 0.2 }} />}
                      <Zap size={12} className={cn(mode === 'sprint' ? "fill-current text-amber-400" : "text-ink-subtle")} />
                      <span>{SPRINT_MODE_LABEL.sprint}</span>
                    </button>
                    <button type="button" onClick={() => handleModeChange('drill')} className={cn("relative py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-xs font-bold z-10 outline-none select-none", mode === 'drill' ? "text-ink" : "text-ink-subtle hover:text-ink-soft")}>
                      {mode === 'drill' && <motion.div layoutId="activeModeBg" className="absolute inset-0 bg-white rounded-lg shadow-xs border border-line -z-10" transition={{ type: "tween", ease: "easeInOut", duration: 0.2 }} />}
                      <Sliders size={12} strokeWidth={3} className={cn(mode === 'drill' ? "text-teal-500" : "text-ink-subtle")} />
                      <span>{SPRINT_MODE_LABEL.drill}</span>
                    </button>
                  </div>
                </div>

                {/* カードB: 発話評価 */}
                <div className="bg-white border border-line/60 rounded-card p-3 shadow-3xs space-y-2">
                  {/* 🚀 改修①: チェックアイコン ＋ 視認性を高めたテキストメッセージ（マイク権限OK）でアプリ設定との混同を完全に防ぐ */}
                  <div className="flex items-center gap-2 pl-1 h-5">
                    <span className="text-xs font-bold text-ink-muted whitespace-nowrap">発話評価</span>
                    {micStatus === 'granted' && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-100/70 shadow-3xs leading-none shrink-0 animate-fade-in whitespace-nowrap">
                        <Check size={10} strokeWidth={4} className="text-emerald-600 shrink-0" />
                        <span className="text-xs font-bold">マイク許可</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-line/70 p-1 rounded-xl grid grid-cols-2 gap-1 relative overflow-hidden isolate">
                    {/* 評価ONボタン */}
                    <button
                      type="button"
                      disabled={micStatus === 'denied'}
                      onClick={() => setConfig({ isAssessmentMode: true })}
                      className={cn(
                        "relative py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-xs font-bold z-10 outline-none select-none disabled:opacity-50 disabled:cursor-not-allowed",
                        isAssessmentMode && micStatus !== 'denied' ? "text-brand" : "text-ink-subtle hover:text-ink-soft"
                      )}
                    >
                      {isAssessmentMode && micStatus !== 'denied' && (
                        <motion.div layoutId="activeAssessBg" className="absolute inset-0 bg-white rounded-lg shadow-xs border border-line -z-10" transition={{ type: "tween", ease: "easeInOut", duration: 0.2 }} />
                      )}

                      {/* 🚀 改修②: 下部警告エリアのシグナルカラーと動的に同期。有効感・警告・ブロック状態を直感的に伝える */}
                      <Mic
                        size={12}
                        className={cn(
                          "transition-colors duration-200",
                          !isAssessmentMode ? "text-ink-subtle" : // 非アクティブ時
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
                        "relative py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-xs font-bold z-10 outline-none select-none",
                        !isAssessmentMode || micStatus === 'denied' ? "text-ink" : "text-ink-subtle hover:text-ink-soft"
                      )}
                    >
                      {(!isAssessmentMode || micStatus === 'denied') && (
                        <motion.div layoutId="activeAssessBg" className="absolute inset-0 bg-white rounded-lg shadow-xs border border-line -z-10" transition={{ type: "tween", ease: "easeInOut", duration: 0.2 }} />
                      )}
                      <MicOff size={12} className={cn(!isAssessmentMode || micStatus === 'denied' ? "text-ink-soft" : "text-ink-subtle")} />
                      <span>OFF</span>
                    </button>
                  </div>

                  {/* 下部の1行案内エリア: 既存の洗練された AnimatePresence ロジックを完全維持 */}
                  <AnimatePresence mode="wait">
                    {micStatus === 'denied' && (
                      <motion.div
                        initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.15 }}
                        className="p-2 rounded-xl border flex items-center gap-2 text-xs font-bold tracking-tight leading-none bg-rose-50/60 border-rose-100 text-rose-700"
                      >
                        <MicOff size={12} className="shrink-0 text-rose-500" strokeWidth={2.5} />
                        <span>マイクがブロックされています。ブラウザ設定を確認してください。</span>
                      </motion.div>
                    )}

                    {micStatus === 'prompt' && isAssessmentMode && (
                      <motion.div
                        initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.15 }}
                        className="p-2 rounded-xl border flex items-center gap-2 text-xs font-bold tracking-tight leading-none bg-amber-50/70 border-amber-100 text-amber-700"
                      >
                        <AlertTriangle size={12} className="shrink-0 text-amber-500" strokeWidth={2.5} />
                        <span>下部のボタンよりマイクの許可をしてください。</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* カードC: 詳細設定（種別・レベル・時間）への導線 — 下段の「出題テーマとTips」と同じ行ボタン様式に統一 */}
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-full bg-white border border-line/60 rounded-control shadow-3xs px-4 py-3.5 flex items-center justify-between text-left select-none active:bg-canvas/50 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-canvas text-ink-subtle group-hover:text-brand-500 flex items-center justify-center transition-colors"><Settings2 size={12} strokeWidth={2.5} /></div>
                    <span className="text-xs font-bold text-ink-soft group-hover:text-brand transition-colors">種別・レベル・時間を変更</span>
                  </div>
                  <ChevronRight size={14} className="text-ink-subtle group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" strokeWidth={2.5} />
                </button>

              </div>

              {/* 出題テーマとTips */}
              <Dialog open={isThemeTipsOpen} onOpenChange={setIsThemeTipsOpen}>
                <DialogTrigger asChild>
                  <button type="button" className="w-full bg-white border border-line/60 rounded-control shadow-3xs px-4 py-3.5 flex items-center justify-between text-left select-none active:bg-canvas/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-canvas text-ink-subtle flex items-center justify-center"><BookOpen size={12} strokeWidth={2.5} /></div>
                      <span className="text-xs font-bold text-ink-soft">出題テーマとTips</span>
                    </div>
                    <ChevronRight size={14} className="text-ink-subtle" strokeWidth={2.5} />
                  </button>
                </DialogTrigger>
                <DialogContent
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  className="sm:max-w-sm border-none bg-surface p-6 shadow-2xl rounded-card text-ink"
                >
                  <DialogHeader><DialogTitle className="text-sm font-bold text-ink-subtle">出題テーマとTips</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-3">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-brand flex items-center gap-1.5"><BookOpen size={14} /> 出題テーマ</h4>
                      <p className="text-xs text-ink-soft font-bold leading-relaxed">{currentTheme}</p>
                    </div>
                    {currentHint && (
                      <>
                        <hr className="border-line" />
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-ink flex items-center gap-1.5"><Lightbulb size={14} /> Tips</h4>
                          <p className="text-xs text-ink-soft font-bold leading-relaxed">{currentHint}</p>
                        </div>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              {/* ヘルプアコーディオン */}
              <div className="bg-white border border-line/60 rounded-control shadow-3xs overflow-hidden">
                <button type="button" onClick={() => setIsHelpAccordionOpen(!isHelpAccordionOpen)} className="w-full px-4 py-3.5 flex items-center justify-between text-left select-none active:bg-canvas/50 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><HelpCircle size={12} strokeWidth={2.5} /></div>
                    <span className="text-xs font-bold text-ink-soft">ヘルプ</span>
                  </div>
                  <ChevronDown size={14} className={cn("text-ink-subtle transition-transform duration-200", isHelpAccordionOpen && "rotate-180")} strokeWidth={2.5} />
                </button>
                <div className={cn("grid transition-all duration-200 ease-in-out", isHelpAccordionOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden">
                    <div className="px-4 pb-3 pt-1 border-t border-line/30 flex flex-col gap-1">

                      <button type="button" onClick={() => setIsHelpOpen(true)} className="w-full flex items-center justify-between text-left py-2.5 px-2 hover:bg-canvas/80 active:scale-[0.99] transition-all rounded-xl group">
                        <span className="text-xs sm:text-sm font-bold text-ink-soft truncate mr-4 group-hover:text-brand transition-colors">音声が聞こえない・認識しない場合</span>
                        <ChevronRight size={14} className="text-ink-subtle group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all shrink-0" strokeWidth={2.5} />
                      </button>
                      <button type="button" onClick={() => setIsMicHelpOpen(true)} className="w-full flex items-center justify-between text-left py-2.5 px-2 hover:bg-canvas/80 active:scale-[0.99] transition-all rounded-xl group border-t border-line/30 mt-0.5">
                        <span className="text-xs sm:text-sm font-bold text-ink-soft truncate mr-4 group-hover:text-brand transition-colors">マイクがブロックされて開始できない場合</span>
                        <ChevronRight size={14} className="text-ink-subtle group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all shrink-0" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </ImmersiveBody>
          {/* 🚀 改修: スクロール下端フェードマスク(残量がある時のみ表示) */}
          <div
            aria-hidden
            className={cn(
              "absolute bottom-0 inset-x-0 h-9 z-10 pointer-events-none bg-linear-to-t transition-opacity duration-200",
              mode === 'sprint' ? "from-brand-50" : "from-canvas",
              "to-transparent",
              mainScrollState.bottom ? "opacity-100" : "opacity-0"
            )}
          />
        </div>

        {/* 下部確定エリア */}
        <div className="px-6 pt-4 shrink-0 bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.015)] z-20 flex flex-col justify-center">
          <div className="w-full max-w-xl mx-auto">
            {isAssessmentMode && micStatus === 'prompt' ? (
              <button
                type="button"
                onClick={handleWarmupAndRequestMic}
                disabled={isPreparing}
                className="w-full h-14 rounded-control font-bold text-xs shadow-lg bg-brand hover:bg-brand-strong text-white flex items-center justify-center border-none outline-none cursor-pointer"
              >
                {isPreparing ? (
                  <div className="flex items-center justify-center w-full h-full"><Loader2 className="h-4 w-4 animate-spin text-white" /></div>
                ) : (
                  <div className="flex items-center justify-center gap-2 h-full w-full leading-none">
                    <Mic size={14} className="text-brand-200 shrink-0" />
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
                  className="h-14 rounded-control font-bold text-xs shadow-lg bg-brand hover:bg-brand-strong text-white flex items-center justify-center border-none outline-none cursor-pointer"
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
                  className="h-14 rounded-control font-bold text-xs shadow-lg bg-ink hover:bg-ink/90 text-white flex items-center justify-center border-none outline-none cursor-pointer"
                >
                  {isPreparing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 h-full w-full leading-none">
                      <Zap size={14} className="fill-current text-brand-300 shrink-0" />
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
                  "w-full h-14 rounded-control font-bold text-sm shadow-lg transition-all flex items-center justify-center border-none outline-none text-white cursor-pointer",
                  mode === 'sprint' ? "bg-brand hover:bg-brand-strong" : "bg-ink hover:bg-ink/90"
                )}
              >
                {isPreparing ? (
                  <div className="flex items-center justify-center w-full h-full"><Loader2 className="h-4 w-4 animate-spin text-white" /></div>
                ) : (
                  <div className="flex items-center justify-center gap-2 h-full w-full leading-none">
                    <span>{SPRINT_MODE_LABEL[mode]}を開始</span>
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
            className="max-w-2xl mx-auto h-[80vh] bg-white border-none rounded-t-panel shadow-2xl outline-none flex flex-col overflow-hidden text-ink"
            onPointerDownOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target?.closest('[data-radix-scroll-area-viewport]')) {
                e.preventDefault();
              }
            }}
          >
            <div className="shrink-0">
              <div className="flex justify-center py-4 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 rounded-full bg-canvas" />
              </div>

              <DrawerHeader className="px-8 py-0 flex flex-col gap-3">
                <div className="flex items-center justify-between h-10">
                  <DrawerTitle className="text-xl font-bold tracking-tight text-ink leading-none">
                    トレーニング設定
                  </DrawerTitle>
                  <DrawerClose asChild>
                    <button className="h-8 px-4 flex items-center justify-center rounded-xl bg-brand-50 border border-brand-100/50 text-brand hover:bg-brand-100/80 text-xs font-bold transition-all active:scale-95 cursor-pointer">
                      閉じる
                    </button>
                  </DrawerClose>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-brand-50 border border-brand-100 text-brand-strong whitespace-nowrap">
                    {QUESTION_TYPES[selectedType]?.label}
                  </span>
                  {hasLevel && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-brand-50 border border-brand-100 text-brand-strong whitespace-nowrap">
                      {selectedLevel === '0' ? 'Basic' : `Lv ${selectedLevel}`}
                    </span>
                  )}
                  {mode === 'sprint' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 font-mono whitespace-nowrap">
                      {selectedTimeLimitSec}s
                    </span>
                  )}
                </div>
              </DrawerHeader>
            </div>

            <div ref={drawerScrollWrapRef} className="flex-1 relative min-h-0 overflow-hidden border-t border-line/40 mt-6" data-vaul-no-drag>
              {/* 🚀 改修: ユーザー状況ロード中（null時）のガタつき（レイアウトシフト）を完全に抑制する美しいスケルトンをマッピング */}
              {userProgress === undefined ? (
                <div className="px-8 py-6 space-y-6 animate-pulse">
                  <div className="space-y-2">
                    <div className="h-3 bg-canvas rounded w-1/4" />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-12 bg-canvas rounded-xl" />
                      <div className="h-12 bg-canvas rounded-xl" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-canvas rounded w-1/4" />
                    <div className="grid grid-cols-4 gap-2">
                      <div className="h-10 bg-canvas rounded-xl" />
                      <div className="h-10 bg-canvas rounded-xl" />
                      <div className="h-10 bg-canvas rounded-xl" />
                      <div className="h-10 bg-canvas rounded-xl" />
                    </div>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-full w-full pr-2">
                  <div className="px-8 py-4 space-y-6 pb-32">
                    
                    {/* 01. 種別 */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-ink-subtle block">問題種別の選択</span>
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
                                "h-12 rounded-xl border text-xs font-bold relative transition-all disabled:opacity-65 flex flex-col items-center justify-center gap-0.5", 
                                isSelected 
                                  ? (mode === 'sprint' ? "bg-brand border-brand text-white" : "bg-ink border-ink text-white") 
                                  : "bg-canvas/50 border-line text-ink-soft hover:bg-canvas"
                              )}
                            >
                              <span>{type.label}</span>
                              {!isSupported && (
                                <div className="flex items-center gap-0.5 text-rose-500 whitespace-nowrap">
                                  <Lock size={9} strokeWidth={2.5} className="shrink-0" />
                                  <span className="text-[11px] font-bold tracking-normal leading-none">提供されていません</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 02. レベル */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-ink-subtle block">レベルの選択</span>
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
                                  "h-10 rounded-xl border text-xs font-bold relative transition-all disabled:opacity-40", 
                                  isSelected 
                                    ? (mode === 'sprint' ? "bg-brand border-brand text-white" : "bg-ink border-ink text-white") 
                                    : "bg-canvas/50 border-line text-ink-soft hover:bg-canvas"
                                )}
                              >
                                {item.label}
                                {isLocked && <Lock size={11} strokeWidth={2.5} className="absolute top-1.5 left-1.5 text-ink-muted" />}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="bg-canvas border border-line/60 rounded-xl p-4 text-center">
                          <p className="text-xs font-bold text-ink-subtle leading-none">この教材にレベルの設定はありません</p>
                        </div>
                      )}
                    </div>

                    {/* 03. 制限時間 */}
                    {mode === 'sprint' && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-ink-subtle block">制限時間の選択</span>
                        <div className="grid grid-cols-2 gap-2">
                          {sortedTimes.map((opt) => {
                            const isSelected = selectedTimeLimitSec === opt.value;
                            return (
                              <button
                                type="button"
                                key={opt.seq_no}
                                onClick={() => handleTimeLimitChange(opt.value)}
                                className={cn("p-3 rounded-xl border text-left transition-all flex items-center justify-between", isSelected ? "bg-brand border-brand text-white shadow-md shadow-brand/10" : "bg-canvas/50 border-line text-ink-soft hover:bg-canvas")}
                              >
                                <div>
                                  <div className="text-xs font-bold">{opt.label}</div>
                                  <div className={cn("text-xs font-bold", isSelected ? "text-brand-200" : "text-ink-subtle")}>{opt.desc}</div>
                                </div>
                                {isSelected && <Check size={12} strokeWidth={3} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                  <ScrollBar orientation="vertical" className="w-2.5 bg-canvas/30" data-vaul-no-drag />
                </ScrollArea>
              )}
              {/* 🚀 改修: 設定ドロワーのスクロール上下フェードマスク(残量がある時のみ表示) */}
              <div
                aria-hidden
                className={cn(
                  "absolute top-0 inset-x-0 h-6 z-10 pointer-events-none bg-linear-to-b from-white to-transparent transition-opacity duration-200",
                  drawerScrollState.top ? "opacity-100" : "opacity-0"
                )}
              />
              <div
                aria-hidden
                className={cn(
                  "absolute bottom-0 inset-x-0 h-10 z-10 pointer-events-none bg-linear-to-t from-white to-transparent transition-opacity duration-200",
                  drawerScrollState.bottom ? "opacity-100" : "opacity-0"
                )}
              />
            </div>
          </DrawerContent>
        </Drawer>
        <AudioTroubleshootingDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />
        <MicTroubleshootingDialog open={isMicHelpOpen} onOpenChange={setIsMicHelpOpen} />
        <ConfirmContainer />
    </ImmersivePanel>
  );
};