'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, BookOpen, Loader2, Search, SearchX } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { lookupColorVowelDictionary, type ColorVowelDicResult } from '@/actions/colorVowelAction';
import { cn } from '@/lib/utils';

// -----------------------------------------------------------------------
// 型定義
// -----------------------------------------------------------------------

interface ColorVowelLookupProviderProps {
  children?: React.ReactNode;
}

interface TooltipState {
  /** 選択されたテキスト（辞書検索キー） */
  text: string;
  /** ツールチップ水平中心の viewport X 座標 */
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

// -----------------------------------------------------------------------
// メインコンポーネント
// -----------------------------------------------------------------------

/**
 * Color Vowel 辞書ルックアッププロバイダー
 *
 * レイアウトに単独配置（children 不要）で動作するグローバル辞書ツールチップ。
 *
 * ### フロー
 * 1. PC: mouseup / Mobile: touchend → 選択テキストを評価
 * 2. 有効な選択があれば選択範囲付近にツールチップを表示
 * 3. ツールチップボタンをクリック → 辞書 API 検索 → ダイアログ表示
 * 4. selectionchange で選択が解除されるとツールチップが自動的に消える
 */
export function ColorVowelLookupProvider({ children }: ColorVowelLookupProviderProps) {
  // SSR ハイドレーション安全のためマウント後のみ portal を描画
  const [mounted, setMounted] = React.useState(false);
  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);
  const [result, setResult] = React.useState<ColorVowelDicResult | null>(null);
  /** 検索を実行した単語（未登録エンプティステート表示に使用） */
  const [searchedWord, setSearchedWord] = React.useState<string>('');
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const activeAudioRef = React.useRef<HTMLAudioElement | null>(null);
  // イベントハンドラのクロージャから参照するために ref でも管理
  const isOpenRef = React.useRef(false);
  const isLoadingRef = React.useRef(false);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  React.useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  // -----------------------------------------------------------------------
  // イベントハンドラ
  // -----------------------------------------------------------------------

  /** mouseup / touchend: 選択確定後にツールチップ表示 */
  const handlePointerUp = React.useCallback(() => {
    // ダイアログ中・ロード中は無視
    if (isOpenRef.current || isLoadingRef.current) return;

    // 選択が確定するまで少し待つ（特にモバイル対応）
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

  /** selectionchange: 選択解除時にツールチップを隠す */
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

  // -----------------------------------------------------------------------
  // 辞書検索（ツールチップクリック時）
  // -----------------------------------------------------------------------

  const handleLookup = React.useCallback(async () => {
    if (!tooltip || isLoadingRef.current) return;

    const word = tooltip.text;

    // ツールチップを即座に消去し、選択も解除
    setTooltip(null);
    window.getSelection()?.removeAllRanges();

    setIsLoading(true);
    setSearchedWord(word);
    try {
      const res = await lookupColorVowelDictionary(word);
      // 未登録語の場合も result = null のままダイアログを開く（エンプティステート表示）
      setResult(res);
      setIsOpen(true);
    } catch (error) {
      console.error('Color Vowel dictionary lookup unexpected:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tooltip]);

  // -----------------------------------------------------------------------
  // 音声再生
  // -----------------------------------------------------------------------

  const handlePlayAudio = React.useCallback((url: string | null) => {
    if (!url) return;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
    }
    const audio = new Audio(url);
    activeAudioRef.current = audio;
    audio.play().catch((err) => console.error('Failed to play audio:', err));
  }, []);

  // -----------------------------------------------------------------------
  // ダイアログ開閉
  // -----------------------------------------------------------------------

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
      }
      setTimeout(() => {
        setResult(null);
        setSearchedWord('');
      }, 200);
    }
  };

  // -----------------------------------------------------------------------
  // レンダリング
  // -----------------------------------------------------------------------

  return (
    <>
      {children}

      {/* ── ツールチップ（createPortal で body 直下に描画） ── */}
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
                  // top 配置のときは自身の高さ分だけ上にずらす
                  transform:
                    tooltip.placement === 'top'
                      ? 'translateX(-50%) translateY(-100%)'
                      : 'translateX(-50%)',
                  zIndex: 9999,
                  pointerEvents: 'auto',
                }}
              >
                {/* ─── ツールチップ本体 ─── */}
                <button
                  // onMouseDown で preventDefault → クリック時に選択が解除されない
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

                {/* ─── キャレット（三角形の矢印） ─── */}
                {tooltip.placement === 'top' && (
                  <div
                    aria-hidden
                    className="absolute left-1/2 -translate-x-1/2 top-full"
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid rgb(15 23 42)', // slate-900
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

      {/* ── ローディングインジケータ ── */}
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
          className="sm:max-w-[420px] overflow-hidden rounded-2xl border-2 shadow-2xl
            [--slide-in-from-left:0] [--slide-in-from-top:0] [--slide-out-to-left:0] [--slide-out-to-top:0]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              <BookOpen className="h-4 w-4 text-primary" />
              Color Vowel Dictionary
            </DialogTitle>
          </DialogHeader>

          <AnimatePresence mode="wait">
            {result ? (
              // ── ヒット時: 辞書データを表示 ──
              <motion.div
                key={result.wordEn}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex flex-col gap-5 py-2"
              >
                {/* 単語表記 */}
                <div className="text-center mt-2">
                  <h2 className="text-3xl font-black tracking-tight text-foreground uppercase">
                    {result.wordEn}
                  </h2>
                  {result.phoneticSpelling && (
                    <p className="text-base font-mono text-muted-foreground mt-1 tracking-wider">
                      {result.phoneticSpelling}
                    </p>
                  )}
                </div>

                {/* 音声コントロール */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className={cn(
                      'h-12 border-2 hover:bg-secondary/50 gap-2 font-semibold',
                      !result.wordAudioUrl && 'opacity-40 cursor-not-allowed'
                    )}
                    disabled={!result.wordAudioUrl}
                    onClick={() => handlePlayAudio(result.wordAudioUrl)}
                  >
                    <Volume2 className="h-4 w-4 text-primary" />
                    Word Sound
                  </Button>
                  <Button
                    variant="outline"
                    className={cn(
                      'h-12 border-2 hover:bg-secondary/50 gap-2 font-semibold',
                      !result.vowel.vowelAudioUrl && 'opacity-40 cursor-not-allowed'
                    )}
                    disabled={!result.vowel.vowelAudioUrl}
                    onClick={() => handlePlayAudio(result.vowel.vowelAudioUrl)}
                  >
                    <Volume2 className="h-4 w-4 text-emerald-500" />
                    Vowel Target
                  </Button>
                </div>

                {/* Visual Chart */}
                <div className="relative flex flex-col items-center justify-center p-5 rounded-2xl border bg-gradient-to-b from-secondary/40 to-secondary/10 shadow-inner">
                  <div className="relative w-28 h-28 bg-background rounded-full shadow-md flex items-center justify-center border-4 border-background transition-transform hover:scale-105 duration-300">
                    <Image
                      src={result.vowel.vowelImageUrl}
                      alt={result.vowel.cvName}
                      fill
                      sizes="112px"
                      className="object-contain p-4"
                      priority
                    />
                  </div>
                  <div className="mt-4 text-center">
                    <span className="font-extrabold text-xl text-primary tracking-wide">
                      {result.vowel.cvName}
                    </span>
                  </div>
                </div>

                {/* 発音の解説 */}
                <div className="rounded-xl bg-muted/50 p-4 border border-dashed">
                  <p className="text-sm font-medium leading-relaxed text-foreground text-justify whitespace-pre-line">
                    {result.vowel.description}
                  </p>
                </div>
              </motion.div>
            ) : (
              // ── 未登録語エンプティステート ──
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