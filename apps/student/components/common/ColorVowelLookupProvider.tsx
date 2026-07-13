'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, BookOpen, Loader2, Search, SearchX } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { lookupColorVowelDictionary } from '@/actions/colorVowelAction';
import { type ColorVowelDicResult, getPartOfSpeechLabel } from '@gabby/types/colorVowel';
import { cn } from '@/lib/utils';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';

// -----------------------------------------------------------------------
// 型定義
// -----------------------------------------------------------------------

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
  /** 選択範囲の上に出すか下に出すか */
  placement: 'top' | 'bottom';
}

// -----------------------------------------------------------------------
// ユーティリティ
// -----------------------------------------------------------------------

/** 選択 Node が入力系・ダイアログ内にあるか判定 */
function isSelectionInForbiddenZone(selection: Selection): boolean {
  const node = selection.anchorNode;
  if (!node) return false;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  return !!el?.closest('input, textarea, [contenteditable="true"], [role="dialog"]');
}

/**
 * 現在の Selection 範囲から表示位置を計算する。
 * - 選択範囲が画面上部にある場合は下側に表示（bottom）
 * - それ以外は上側に表示（top）
 * - 水平位置は viewport 端からはみ出さないようにクランプ
 */
function resolveTooltipPosition(): Omit<TooltipState, 'text'> | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect || rect.width === 0) return null;

  const GAP = 10;
  const HORIZONTAL_PADDING = 80; // ツールチップが端に近すぎないよう余白

  const x = Math.max(
    HORIZONTAL_PADDING,
    Math.min(window.innerWidth - HORIZONTAL_PADDING, rect.left + rect.width / 2)
  );

  if (rect.top > 60) {
    // 上に十分スペースがある → 選択範囲の上に表示
    return { x, y: rect.top - GAP, placement: 'top' };
  } else {
    // 画面上部に近い → 選択範囲の下に表示
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
        // primaryStressSyllable は 1 始まり
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

        // ストレス音節だが母音綴りが見つからない、またはストレス音節ではない場合
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

  const { play: playAudio, stop: stopAudio } = usePlayAudioSpeech();
  const isOpenRef = React.useRef(false);
  const isLoadingRef = React.useRef(false);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  React.useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  const activeResult = React.useMemo(() => {
    if (results.length === 0) return null;
    return results.find((r) => r.partOfSpeech === activeTab) || results[0];
  }, [results, activeTab]);

  const handlePointerUp = React.useCallback(() => {
    if (isOpenRef.current || isLoadingRef.current) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';

      if (text.length <= 1 || text.length > 30) {
        setTooltip(null);
        return;
      }

      if (!selection || isSelectionInForbiddenZone(selection)) {
        setTooltip(null);
        return;
      }

      const pos = resolveTooltipPosition();
      if (!pos) {
        setTooltip(null);
        return;
      }

      setTooltip({ text, ...pos });
    }, 120);
  }, []);

  const handleSelectionChange = React.useCallback(() => {
    const text = window.getSelection()?.toString().trim() ?? '';
    if (text.length <= 1) {
      setTooltip(null);
    }
  }, []);

  React.useEffect(() => {
    document.addEventListener('mouseup', handlePointerUp);
    document.addEventListener('touchend', handlePointerUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('mouseup', handlePointerUp);
      document.removeEventListener('touchend', handlePointerUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handlePointerUp, handleSelectionChange]);

  const handleLookup = React.useCallback(async () => {
    if (!tooltip || isLoadingRef.current) return;

    const word = tooltip.text;

    setTooltip(null);
    window.getSelection()?.removeAllRanges();

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

  return (
    <>
      {children}

      {/* ── ツールチップ ── */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {tooltip && (
              <motion.div
                key="cv-tooltip"
                initial={{ opacity: 0, scale: 0.88, y: tooltip.placement === 'top' ? 6 : -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: tooltip.placement === 'top' ? 6 : -6 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'fixed',
                  left: tooltip.x,
                  top: tooltip.y,
                  transform:
                    tooltip.placement === 'top'
                      ? 'translateX(-50%) translateY(-100%)'
                      : 'translateX(-50%)',
                  zIndex: 9999,
                  pointerEvents: 'auto',
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
          className="sm:max-w-[420px] overflow-hidden rounded-2xl border-2 shadow-2xl"
          style={{
            '--tw-enter-translate-x': '0',
            '--tw-enter-translate-y': '0',
            '--tw-exit-translate-x': '0',
            '--tw-exit-translate-y': '0',
          } as React.CSSProperties}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              <BookOpen className="h-4 w-4 text-primary" />
              Color Vowel Dictionary
            </DialogTitle>
          </DialogHeader>

          <AnimatePresence mode="wait">
            {activeResult ? (
              <motion.div
                key={activeResult.dicId}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex flex-col gap-5 py-2"
              >
                {/* 複数品詞切り替えタブ */}
                {results.length > 1 && (
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-1">
                    <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${results.length}, minmax(0, 1fr))` }}>
                      {results.map((r) => (
                        <TabsTrigger key={r.dicId} value={r.partOfSpeech} className="text-xs">
                          {getPartOfSpeechLabel(r.partOfSpeech)}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}

                {/* 単語表記（下線下にアイコンが出るため下マージンmb-14を確保） */}
                <div className="text-center mt-2 space-y-2">
                  <div className="flex items-center justify-center gap-2 flex-wrap mb-14">
                    <h2 className="text-3xl font-black tracking-tight text-foreground select-none">
                      {renderWordWithStress(
                        activeResult.syllables,
                        activeResult.primaryStressSyllable,
                        activeResult.stressVowelSpelling,
                        activeResult.wordEn,
                        activeResult.vowel.vowelImageUrl
                      )}
                    </h2>
                    {results.length === 1 && (
                      <Badge variant="secondary" className="text-xs font-semibold px-2 py-0.5 self-center">
                        {getPartOfSpeechLabel(activeResult.partOfSpeech)}
                      </Badge>
                    )}
                  </div>
                  {activeResult.wordJa && (
                    <p className="text-base font-semibold text-foreground pt-2">
                      {activeResult.wordJa}
                    </p>
                  )}
                  {activeResult.phoneticSpelling && (
                    <p className="text-base font-mono text-muted-foreground tracking-wider">
                      {activeResult.phoneticSpelling}
                    </p>
                  )}
                </div>

                {/* 音声コントロール */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className={cn(
                      'h-12 border-2 hover:bg-secondary/50 gap-2 font-semibold',
                      !activeResult.wordAudioUrl && 'opacity-40 cursor-not-allowed'
                    )}
                    disabled={!activeResult.wordAudioUrl}
                    onClick={() => handlePlayAudio(activeResult.wordAudioUrl, 'word')}
                  >
                    <Volume2 className="h-4 w-4 text-primary" />
                    Word Sound
                  </Button>
                  <Button
                    variant="outline"
                    className={cn(
                      'h-12 border-2 hover:bg-secondary/50 gap-2 font-semibold',
                      !activeResult.vowel.vowelAudioUrl && 'opacity-40 cursor-not-allowed'
                    )}
                    disabled={!activeResult.vowel.vowelAudioUrl}
                    onClick={() => handlePlayAudio(activeResult.vowel.vowelAudioUrl, 'vowel')}
                  >
                    <Volume2 className="h-4 w-4 text-emerald-500" />
                    Vowel Target
                  </Button>
                </div>

                {/* 発音の解説 */}
                <div className="rounded-xl bg-muted/50 p-4 border border-dashed">
                  <p className="text-sm font-medium leading-relaxed text-foreground text-justify whitespace-pre-line">
                    {activeResult.vowel.description}
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="cv-empty"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex flex-col items-center gap-4 py-8 px-2"
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
        </DialogContent>
      </Dialog>
    </>
  );
}