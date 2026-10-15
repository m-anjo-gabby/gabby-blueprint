// apps\student\components\common\ColorVowelLookupProvider.tsx
'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { lookupColorVowelDictionary } from '@/actions/colorVowelAction';
import type { ColorVowelDicResult } from '@gabby/types/colorVowel';
import { cn } from '@/lib/utils';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { clientLogger } from '@gabby/lib/logger/client';
import {
  ColorVowelDictionarySheet,
  type DictionaryAudioType,
  type DictionaryLookupStatus,
} from './ColorVowelDictionarySheet';

// -----------------------------------------------------------------------
// Context & 型定義
// -----------------------------------------------------------------------

export interface ColorVowelLookupContextType {
  openTooltip: (word: string, rect: DOMRect, wordKey: string) => void;
  closeTooltip: () => void;
  activeWordKey: string | null;
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
  /** タップされた単語インスタンスを一意に識別するキー（フォーカス対象の特定に使用） */
  key: string;
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
function resolveTooltipPositionFromRect(rect: DOMRect): Omit<TooltipState, 'text' | 'key'> {
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
  const [status, setStatus] = React.useState<DictionaryLookupStatus>('done');

  const { play: playAudio, stop: stopAudio, isPlaying } = usePlayAudioSpeech();
  const isLoadingRef = React.useRef(false);
  const openedAtRef = React.useRef(0);

  React.useEffect(() => setMounted(true), []);

  const activeResult = React.useMemo(() => {
    if (results.length === 0) return null;
    return results.find((r) => r.partOfSpeech === activeTab) || results[0];
  }, [results, activeTab]);

  const openTooltip = React.useCallback((word: string, rect: DOMRect, wordKey: string) => {
    const cleaned = word.replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, '').trim();
    // 1文字の単語（a, I）も検索対象。英字を含まないもの（数字のみ等）は対象外
    if (!/[A-Za-z]/.test(cleaned)) {
      setTooltip(null);
      return;
    }

    const pos = resolveTooltipPositionFromRect(rect);
    openedAtRef.current = Date.now();
    setTooltip({ text: cleaned, key: wordKey, ...pos });
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
      // タップ直後（慣性スクロールの残滓等）に発火した scroll イベントは無視する。
      // モバイルではタップ操作自体が touchmove を伴い、開いた直後に
      // スクロールコンテナの momentum scroll が scroll イベントを発生させ、
      // ツールチップが開いた瞬間に閉じてしまう事象を防ぐ。
      if (Date.now() - openedAtRef.current < 300) return;
      setTooltip(null);
    };

    window.addEventListener('pointerdown', handlePointerDownOutside);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [tooltip]);

  // シートは先に開き、見出し（タップした単語）以外を骨組みにして検索結果を待つ
  const handleLookup = React.useCallback(async () => {
    if (!tooltip || isLoadingRef.current) return;

    const word = tooltip.text;
    setTooltip(null);

    isLoadingRef.current = true;
    setSearchedWord(word);
    setResults([]);
    setActiveTab('');
    setStatus('loading');
    setIsOpen(true);
    try {
      const res = await lookupColorVowelDictionary(word);
      setResults(res);
      setActiveTab(res[0]?.partOfSpeech ?? '');
      setStatus('done');
    } catch (error) {
      clientLogger.error('cvDict:lookup_unexpected', 'Color Vowel dictionary lookup failed', { err: error });
      setStatus('error');
    } finally {
      isLoadingRef.current = false;
    }
  }, [tooltip]);

  const audioId = (type: DictionaryAudioType) =>
    activeResult ? `${activeResult.wordEn}-${activeResult.partOfSpeech}-${type}` : type;

  // タップしてから再生が終わるまで（読み込み中も含めて）を「再生中」として表示する。
  // isPlaying は音が鳴り始めてから立つため、読み込み中の分は手元の状態で補う
  const [requestedAudio, setRequestedAudio] = React.useState<DictionaryAudioType | null>(null);

  const handlePlayAudio = (url: string | null, type: DictionaryAudioType) => {
    if (!url) return;
    setRequestedAudio(type);
    playAudio(url, audioId(type))
      .catch((err) => clientLogger.warn('cvDict:play_audio_failed', 'Failed to play audio', { err }))
      // 再生の終了・停止（再タップ）・失敗で解除する。別の音声に切り替わっていればそのまま
      .finally(() => setRequestedAudio((current) => (current === type ? null : current)));
  };

  const playingAudio: DictionaryAudioType | null =
    isPlaying === audioId('word') ? 'word' : isPlaying === audioId('vowel') ? 'vowel' : requestedAudio;

  // 結果は閉じるアニメーションの間も残す（次の検索の開始時に作り直す）
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) stopAudio();
  };

  const contextValue = React.useMemo<ColorVowelLookupContextType>(
    () => ({
      openTooltip,
      closeTooltip,
      activeWordKey: tooltip?.key ?? null,
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
                      'rounded-full bg-ink px-4 py-2.5',
                      'text-xs font-semibold text-white shadow-2xl',
                      'ring-1 ring-black/10',
                      'hover:bg-ink-soft active:scale-[0.95]',
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

      {/* ── 辞書結果シート ── */}
      <ColorVowelDictionarySheet
        open={isOpen}
        onOpenChange={handleOpenChange}
        searchedWord={searchedWord}
        status={status}
        results={results}
        activeResult={activeResult}
        onSelectPartOfSpeech={setActiveTab}
        playingAudio={playingAudio}
        onPlayAudio={handlePlayAudio}
      />
    </ColorVowelLookupContext.Provider>
  );
}