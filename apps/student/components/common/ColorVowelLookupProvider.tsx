// apps\student\components\common\ColorVowelLookupProvider.tsx
'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, BookA, Loader2, Search, SearchX } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { lookupColorVowelDictionary } from '@/actions/colorVowelAction';
import { type ColorVowelDicResult, getPartOfSpeechLabel, COLOR_VOWEL_COLORS } from '@gabby/types/colorVowel';
import { cn } from '@/lib/utils';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';

// -----------------------------------------------------------------------
// Context & 型定義
// -----------------------------------------------------------------------

export interface ColorVowelLookupContextType {
  openTooltip: (word: string, rect: DOMRect) => void;
  closeTooltip: () => void;
  activeWord: string | null;
}

const ColorVowelLookupContext = React.createContext<ColorVowelLookupContextType | null>(null);

export function useColorVowelLookup() {
  const context = React.useContext(ColorVowelLookupContext);
  if (!context) {
    throw new Error('useColorVowelLookup must be used within a ColorVowelLookupProvider');
  }
  return context;
}

interface ColorVowelLookupProviderProps {
  children?: React.ReactNode;
}

interface TooltipState {
  /** 選択されたテキスト（辞書検索キー） */
  text: string;
  /** ツールチップ水平中心 of viewport X 座標 */
  x: number;
  /** 配置基準点の viewport Y 座標 */
  y: number;
  /** 単語の上に出すか下に出すか */
  placement: 'top' | 'bottom';
}

// -----------------------------------------------------------------------
// ユーティリティ
// -----------------------------------------------------------------------

/**
 * 単語要素の DOMRect からツールチップ表示位置を計算する。
 */
function resolveTooltipPositionFromRect(rect: DOMRect): Omit<TooltipState, 'text'> {
  const GAP = 8; // 単語とツールチップの間隔
  const HORIZONTAL_PADDING = 70;

  const x = Math.max(
    HORIZONTAL_PADDING,
    Math.min(window.innerWidth - HORIZONTAL_PADDING, rect.left + rect.width / 2)
  );

  if (rect.top > 70) {
    // 上側表示: y = 単語上端 - GAP → translateY(-100%) でツールチップ本体を上に退避
    // 突起 (top-full) がちょうど単語上端の GAP 上に来る
    return { x, y: rect.top - GAP, placement: 'top' };
  } else {
    // 下側表示: y = 単語下端 + GAP → ツールチップ上端から突起が単語下端の GAP 下に来る
    return { x, y: rect.bottom + GAP, placement: 'bottom' };
  }
}

/**
 * 音節データ (syllables) をデリミタ(-)で分割し、第一アクセントの音節内の特定母音スペルに下線を引いて描画する。
 * 下線の直下にColor Vowelの小さなアイコンを絶対配置する。
 */
function renderWordWithStress(
  syllables: string | null | undefined,
  primaryStressSyllable: number,
  stressVowelSpelling: string | null | undefined,
  wordEn: string,
  vowelImageUrl: string
) {
  if (!syllables) {
    return <span className="lowercase">{wordEn}</span>;
  }

  const parts = syllables.split('-');
  return (
    <span className="lowercase tracking-wide">
      {parts.map((part, index) => {
        const isStressed = index + 1 === primaryStressSyllable;
        if (isStressed && stressVowelSpelling) {
          const partLower = part.toLowerCase();
          const targetLower = stressVowelSpelling.toLowerCase();
          const targetIndex = partLower.indexOf(targetLower);

          if (targetIndex !== -1) {
            const before = part.slice(0, targetIndex);
            const target = part.slice(targetIndex, targetIndex + targetLower.length);
            const after = part.slice(targetIndex + targetLower.length);

            return (
              <span key={index}>
                {before}
                <span className="relative inline-block">
                  <span className="underline decoration-3 decoration-primary underline-offset-4 font-black">
                    {target}
                  </span>
                  <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[42px] h-[42px] flex items-center justify-center pointer-events-none overflow-hidden">
                    <Image
                      src={vowelImageUrl}
                      alt="vowel icon"
                      width={42}
                      height={42}
                      className="object-contain p-0"
                    />
                  </span>
                </span>
                {after}
              </span>
            );
          }
        }

        if (isStressed) {
          return (
            <span key={index} className="relative inline-block">
              <span className="underline decoration-3 decoration-primary underline-offset-4 font-black">
                {part}
              </span>
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[42px] h-[42px] flex items-center justify-center pointer-events-none overflow-hidden">
                <Image
                  src={vowelImageUrl}
                  alt="vowel icon"
                  width={42}
                  height={42}
                  className="object-contain p-0"
                />
              </span>
            </span>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}

// -----------------------------------------------------------------------
// メインコンポーネント
// -----------------------------------------------------------------------

export function ColorVowelLookupProvider({ children }: ColorVowelLookupProviderProps) {
  const [mounted, setMounted] = React.useState(false);
  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);
  const [results, setResults] = React.useState<ColorVowelDicResult[]>([]);
  const [activeTab, setActiveTab] = React.useState<string>('');
  const [searchedWord, setSearchedWord] = React.useState<string>('');
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const { play: playAudio, stop: stopAudio, isPlaying } = usePlayAudioSpeech();
  const isLoadingRef = React.useRef(false);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  const activeResult = React.useMemo(() => {
    if (results.length === 0) return null;
    return results.find((r) => r.partOfSpeech === activeTab) || results[0];
  }, [results, activeTab]);

  const openTooltip = React.useCallback((word: string, rect: DOMRect) => {
    const cleaned = word.replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, '').trim();
    if (!cleaned || cleaned.length <= 1) {
      setTooltip(null);
      return;
    }

    const pos = resolveTooltipPositionFromRect(rect);
    setTooltip({ text: cleaned, ...pos });
  }, []);

  const closeTooltip = React.useCallback(() => {
    setTooltip(null);
  }, []);

  // ツールチップ外タップやスクロールでツールチップを閉じる
  React.useEffect(() => {
    if (!tooltip) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('#cv-tooltip') || target?.closest('[data-lookup-word]')) {
        return;
      }
      setTooltip(null);
    };

    const handleScroll = () => {
      setTooltip(null);
    };

    window.addEventListener('pointerdown', handlePointerDownOutside);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [tooltip]);

  const handleLookup = React.useCallback(async () => {
    if (!tooltip || isLoadingRef.current) return;

    const word = tooltip.text;
    setTooltip(null);

    setIsLoading(true);
    setSearchedWord(word);
    try {
      const res = await lookupColorVowelDictionary(word);
      setResults(res);
      if (res.length > 0) {
        setActiveTab(res[0].partOfSpeech);
      } else {
        setActiveTab('');
      }
      setIsOpen(true);
    } catch (error) {
      console.error('Color Vowel dictionary lookup unexpected:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tooltip]);

  const handlePlayAudio = React.useCallback((url: string | null, type: 'word' | 'vowel') => {
    if (!url) return;
    const id = activeResult ? `${activeResult.wordEn}-${activeResult.partOfSpeech}-${type}` : type;
    playAudio(url, id).catch((err) => console.error('Failed to play audio:', err));
  }, [playAudio, activeResult]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      stopAudio();
      setTimeout(() => {
        setResults([]);
        setActiveTab('');
        setSearchedWord('');
      }, 200);
    }
  };

  const contextValue = React.useMemo<ColorVowelLookupContextType>(
    () => ({
      openTooltip,
      closeTooltip,
      activeWord: tooltip?.text ?? null,
    }),
    [openTooltip, closeTooltip, tooltip]
  );

  return (
    <ColorVowelLookupContext.Provider value={contextValue}>
      {children}

      {/* ── ツールチップ ── */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {tooltip && (
              <div
                key="cv-tooltip-positioner"
                style={{
                  position: 'fixed',
                  left: tooltip.x,
                  top: tooltip.y,
                  // top 時: translateY(-100%) でボックス全体を y 座標より上に押し上げ
                  // bottom 時: translateX(-50%) のみで上端が y になる
                  transform: tooltip.placement === 'top'
                    ? 'translateX(-50%) translateY(-100%)'
                    : 'translateX(-50%)',
                  zIndex: 9999,
                  pointerEvents: 'auto',
                }}
              >
                <motion.div
                  id="cv-tooltip"
                  initial={{ opacity: 0, scale: 0.88, y: tooltip.placement === 'top' ? 6 : -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.88, y: tooltip.placement === 'top' ? 6 : -6 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    transformOrigin: tooltip.placement === 'top' ? 'bottom center' : 'top center',
                  }}
                >
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleLookup}
                    className={cn(
                      'group flex items-center gap-2 whitespace-nowrap',
                      'rounded-full bg-slate-900 px-4 py-2.5',
                      'text-xs font-semibold text-white shadow-2xl',
                      'ring-1 ring-black/10',
                      'hover:bg-slate-700 active:scale-[0.95]',
                      'transition-all duration-150 select-none'
                    )}
                  >
                    <Search className="h-3.5 w-3.5 shrink-0 opacity-75" />
                    <span>Color Vowelを検索</span>
                  </button>

                  {/* 突起: top 時はボックス下端（単語方向）に下向き三角 */}
                  {tooltip.placement === 'top' && (
                    <div
                      aria-hidden
                      className="absolute left-1/2 -translate-x-1/2 top-full"
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '6px solid rgb(15 23 42)',
                      }}
                    />
                  )}
                  {/* 突起: bottom 時はボックス上端（単語方向）に上向き三角 */}
                  {tooltip.placement === 'bottom' && (
                    <div
                      aria-hidden
                      className="absolute left-1/2 -translate-x-1/2 bottom-full"
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderBottom: '6px solid rgb(15 23 42)',
                      }}
                    />
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* ── ローディング ── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            key="cv-loading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border bg-background px-4 py-2 shadow-lg"
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs font-medium text-muted-foreground">
              Searching Color Vowel...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 辞書結果ダイアログ ── */}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(
            "sm:max-w-[420px] flex flex-col overflow-hidden rounded-2xl border border-indigo-600/20 dark:border-indigo-950/50 shadow-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 p-0 gap-0 [&>button]:text-indigo-100 hover:[&>button]:text-white [&>button]:focus:ring-indigo-500 [&>button]:focus:ring-offset-indigo-600",
            activeResult ? "h-[520px] sm:h-[70vh] max-h-[90vh]" : "h-auto"
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="bg-transparent px-6 pt-5 pb-4 text-white border-none shrink-0 space-y-0">
            <DialogTitle className="flex items-center gap-2 text-sm font-bold tracking-wider text-indigo-50/90 uppercase">
              <BookA className="h-5 w-5 text-indigo-100 opacity-95 shrink-0" />
              <span className="tracking-widest font-black text-white">Color Vowel Dictionary</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col flex-1 overflow-hidden bg-background rounded-b-[15px]">
            {/* 品詞タブ */}
            {results.length > 1 && (
              <div className="w-full px-6 pt-5 shrink-0 z-10 bg-background">
                <div 
                  className={cn(
                    "flex items-center gap-1.5 w-full pb-0.5 select-none",
                    results.length >= 4 
                      ? "overflow-x-auto scrollbar-none snap-x justify-start" 
                      : "justify-center"
                  )}
                >
                  <div className={cn("flex gap-1.5", results.length >= 4 ? "mx-0" : "mx-auto")}>
                    {results.map((r) => {
                      const isActive = r.partOfSpeech === activeTab;
                      return (
                        <button
                          key={r.dicId}
                          onClick={() => setActiveTab(r.partOfSpeech)}
                          className={cn(
                            "px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-150 shrink-0 snap-center border",
                            isActive
                              ? "bg-primary text-primary-foreground border-primary shadow-sm scale-102"
                              : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                          )}
                        >
                          {getPartOfSpeechLabel(r.partOfSpeech)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* メイン単語表記 */}
            {activeResult && (
              <div className={cn(
                "text-center w-full h-32 pb-14 flex flex-col items-center justify-center shrink-0 bg-background px-6",
                results.length > 1 ? "pt-2" : "pt-6"
              )}>
                <h2 className="text-4xl font-black tracking-tight text-foreground select-none">
                  {renderWordWithStress(
                    activeResult.syllables,
                    activeResult.primaryStressSyllable,
                    activeResult.stressVowelSpelling,
                    activeResult.wordEn,
                    activeResult.vowel.vowelImageUrl
                  )}
                </h2>
              </div>
            )}

            {/* 音声コントロール */}
            {activeResult && (() => {
              const isWordPlaying = isPlaying === `${activeResult.wordEn}-${activeResult.partOfSpeech}-word`;
              const isVowelPlaying = isPlaying === `${activeResult.wordEn}-${activeResult.partOfSpeech}-vowel`;
              return (
                <div className="grid grid-cols-2 gap-3 px-6 pb-4 shrink-0 bg-background">
                  <Button
                    variant="outline"
                    className={cn(
                      'h-12 border-2 hover:bg-secondary/50 gap-2 font-bold transition-all',
                      !activeResult.wordAudioUrl && 'opacity-40 cursor-not-allowed'
                    )}
                    disabled={!activeResult.wordAudioUrl}
                    onClick={() => handlePlayAudio(activeResult.wordAudioUrl, 'word')}
                  >
                    {isWordPlaying ? (
                      <Loader2 className="h-4.5 w-4.5 animate-spin text-primary" />
                    ) : (
                      <Volume2 className="h-4.5 w-4.5 text-primary" />
                    )}
                    単語を再生
                  </Button>
                  <Button
                    variant="outline"
                    className={cn(
                      'h-12 border-2 hover:bg-secondary/50 gap-2 font-bold transition-all',
                      !activeResult.vowel.vowelAudioUrl && 'opacity-40 cursor-not-allowed'
                    )}
                    disabled={!activeResult.vowel.vowelAudioUrl}
                    onClick={() => handlePlayAudio(activeResult.vowel.vowelAudioUrl, 'vowel')}
                  >
                    {isVowelPlaying ? (
                      <Loader2 className="h-4.5 w-4.5 animate-spin text-emerald-500" />
                    ) : (
                      <Volume2 className="h-4.5 w-4.5 text-emerald-500" />
                    )}
                    母音を再生
                  </Button>
                </div>
              );
            })()}

            {/* スクロール領域（訳・解説） */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-1 scrollbar-thin">
              <AnimatePresence mode="wait">
                {activeResult ? (
                  <motion.div
                    key={activeResult.dicId}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18, ease: [0.215, 0.610, 0.355, 1.000] }}
                    className="flex flex-col gap-5 w-full"
                  >
                    <div className="space-y-4">
                      <div className="flex flex-col bg-secondary/30 rounded-xl p-4 border border-border/60 text-left">
                        <div className="flex items-center gap-3 select-none border-b border-border/30 pb-2.5">
                          <span className="text-[11px] font-black tracking-wider text-primary bg-background dark:bg-muted border border-primary/20 rounded px-2.5 py-0.5 shadow-sm uppercase shrink-0">
                            {getPartOfSpeechLabel(activeResult.partOfSpeech)}
                          </span>
                          {activeResult.phoneticSpelling && (
                            <p className="text-sm font-mono text-muted-foreground/80 tracking-widest pt-0.5">
                              {activeResult.phoneticSpelling}
                            </p>
                          )}
                        </div>

                        {activeResult.wordJa && (
                          <p className="text-lg font-bold text-foreground tracking-wide leading-snug pt-3 pl-0.5">
                            {activeResult.wordJa}
                          </p>
                        )}
                      </div>

                      <div className="rounded-xl bg-muted/40 p-4 border border-dashed border-border/80 flex flex-col gap-3">
                        <div className="flex items-center gap-2 select-none border-b border-border/20 pb-2">
                          <div className="relative w-6 h-6 bg-background rounded-full border border-border flex items-center justify-center shadow-sm overflow-hidden shrink-0">
                            <Image
                              src={activeResult.vowel.vowelImageUrl}
                              alt="vowel icon thumbnail"
                              width={16}
                              height={16}
                              className="object-contain"
                            />
                          </div>
                          <span
                            className={cn(
                              "text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-sm border shrink-0 select-none pt-0.5",
                              activeResult.vowel.cvId === 'white_tie' || activeResult.vowel.cvId === 'silver_pin'
                                ? "bg-slate-900 border-slate-900"
                                : activeResult.vowel.cvId === 'black_cat'
                                  ? "bg-slate-100 border-slate-200"
                                  : "bg-muted dark:bg-muted/60 border-border"
                            )}
                            style={{
                              color: COLOR_VOWEL_COLORS[activeResult.vowel.cvId] ?? 'currentColor',
                            }}
                          >
                            {activeResult.vowel.cvName}
                          </span>
                        </div>

                        <p className="text-sm font-medium leading-relaxed text-muted-foreground text-justify whitespace-pre-line pl-0.5">
                          {activeResult.vowel.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="cv-empty"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="flex flex-col items-center gap-4 py-8 px-6"
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <SearchX className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="text-center space-y-1.5">
                      <p className="text-base font-bold text-foreground">
                        Not in dictionary
                      </p>
                      {searchedWord && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-mono font-semibold text-foreground">
                            &ldquo;{searchedWord}&rdquo;
                          </span>{' '}
                          はColor Vowel辞書に登録されていません。
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground/70 text-center leading-relaxed max-w-[260px]">
                      辞書には主要な英単語の母音パターンが収録されています。<br />
                      固有名詞・略語は対象外の場合があります。
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ColorVowelLookupContext.Provider>
  );
}