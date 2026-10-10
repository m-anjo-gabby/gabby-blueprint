// apps\student\components\common\ColorVowelDictionarySheet.tsx
'use client';

import * as React from 'react';
import Image from 'next/image';
import { BookA, Loader2, SearchX, TriangleAlert, Volume2 } from 'lucide-react';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { type ColorVowelDicResult, getPartOfSpeechLabel, getColorVowelBorderColor } from '@gabby/types/colorVowel';
import { ipaToPhonemes, type Phoneme } from '@gabby/lib/colorVowel/phonemes';
import { cn } from '@/lib/utils';

export type DictionaryLookupStatus = 'loading' | 'done' | 'error';
export type DictionaryAudioType = 'word' | 'vowel';

interface ColorVowelDictionarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** タップされた単語（検索中・見つからない場合の見出しに使う） */
  searchedWord: string;
  status: DictionaryLookupStatus;
  results: ColorVowelDicResult[];
  activeResult: ColorVowelDicResult | null;
  onSelectPartOfSpeech: (partOfSpeech: string) => void;
  /** 再生中の音声（null: 停止中） */
  playingAudio: DictionaryAudioType | null;
  onPlayAudio: (url: string | null, type: DictionaryAudioType) => void;
}

/**
 * Color Vowel 辞書の結果を下から出るシートで表示する（読んでいた英文を上に残したまま確認できるように）。
 * 検索中は見出し（タップした単語）を先に出し、データで決まる部分だけを同じ形の骨組みにする。
 */
export function ColorVowelDictionarySheet({
  open,
  onOpenChange,
  searchedWord,
  status,
  results,
  activeResult,
  onSelectPartOfSpeech,
  playingAudio,
  onPlayAudio,
}: ColorVowelDictionarySheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* 高さは表示領域の85%で止め、超える分はシート内でスクロールする（dvh: iOS Safari のツールバー分を除いた高さ） */}
      <DrawerContent className="mx-auto max-h-[85dvh] w-full max-w-md bg-surface">
        <DrawerHeader className="flex flex-row items-center justify-between gap-2 px-5 pb-1 text-left">
          <DrawerTitle className="flex items-center gap-2 text-sm font-bold text-ink-soft">
            <BookA className="size-4 text-brand" aria-hidden />
            Color Vowel辞書
          </DrawerTitle>
          <DrawerCloseButton />
        </DrawerHeader>
        <DrawerDescription className="sr-only">タップした単語の Color Vowel・音素・意味</DrawerDescription>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          {status === 'done' && results.length > 1 && (
            <PartOfSpeechTabs results={results} active={activeResult} onSelect={onSelectPartOfSpeech} />
          )}

          {status === 'loading' && <EntrySkeleton word={searchedWord} />}
          {status === 'error' && <LookupMessage word={searchedWord} kind="error" />}
          {status === 'done' && !activeResult && <LookupMessage word={searchedWord} kind="notFound" />}
          {status === 'done' && activeResult && (
            <EntryView result={activeResult} playingAudio={playingAudio} onPlayAudio={onPlayAudio} />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// -----------------------------------------------------------------------
// 品詞の切り替え
// -----------------------------------------------------------------------

function PartOfSpeechTabs({
  results,
  active,
  onSelect,
}: {
  results: ColorVowelDicResult[];
  active: ColorVowelDicResult | null;
  onSelect: (partOfSpeech: string) => void;
}) {
  return (
    <div role="tablist" aria-label="品詞" className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none">
      {results.map((r) => {
        const selected = r.dicId === active?.dicId;
        return (
          <button
            key={r.dicId}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(r.partOfSpeech)}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-colors',
              selected ? 'bg-brand text-white' : 'bg-canvas text-ink-soft hover:bg-line/60'
            )}
          >
            {getPartOfSpeechLabel(r.partOfSpeech)}
          </button>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------
// 見出し（強勢のある母音の綴りに Color Vowel の色で下線を引き、その真下に Color Vowel のアイコンを置く）
// -----------------------------------------------------------------------

/** アイコン（42px）と下線の間隔の分、見出しの下に空ける余白。骨組みと共有する */
const HEADWORD_ICON_SPACE = 'pb-14';

/** 見出し語の文字サイズの段階（rem）。text-4xl → 3xl → 2xl → xl */
const HEADWORD_FONT_SIZES = ['2.25rem', '1.875rem', '1.5rem', '1.25rem'];

/**
 * 見出し語を1行に収める。2行に折り返すと、強勢の真下のアイコンが2行目の文字に重なるため、
 * 描画前に実際の幅を測り、シートの幅に収まるまで文字サイズを下げる（字の幅は m・w 等で大きく違うため字数では決めない）。
 * 最小の段階でも収まらない語だけ折り返す。骨組みの見出し（タップした単語）にも使う
 */
function useFitHeadword(ref: React.RefObject<HTMLHeadingElement | null>, word: string) {
  React.useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      el.style.whiteSpace = 'nowrap';
      const size = HEADWORD_FONT_SIZES.find((fontSize) => {
        el.style.fontSize = fontSize;
        return el.scrollWidth <= box.clientWidth;
      });
      if (!size) el.style.whiteSpace = 'normal';
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [ref, word]);
}

function StressMark({ text, color, vowel }: { text: string; color: string; vowel: ColorVowelDicResult['vowel'] }) {
  return (
    <span className="relative inline-block">
      <span className="font-bold underline decoration-4 underline-offset-[6px]" style={{ textDecorationColor: color }}>
        {text}
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full mt-2 flex size-[42px] -translate-x-1/2 items-center justify-center overflow-hidden">
        <Image src={vowel.vowelImageUrl} alt={`${vowel.cvName} のアイコン`} width={42} height={42} className="object-contain" />
      </span>
    </span>
  );
}

function StressedWord({ result, color }: { result: ColorVowelDicResult; color: string }) {
  const { syllables, primaryStressSyllable, stressVowelSpelling, wordEn, vowel } = result;
  if (!syllables) return <>{wordEn}</>;

  // 略語（CEO）・曜日（Friday）等があるため、小文字化せず登録どおりの表記で表示する
  return (
    <>
      {syllables.split('-').map((part, index) => {
        if (index + 1 !== primaryStressSyllable) return <span key={index}>{part}</span>;

        const at = stressVowelSpelling ? part.toLowerCase().indexOf(stressVowelSpelling.toLowerCase()) : -1;
        if (at < 0) return <StressMark key={index} text={part} color={color} vowel={vowel} />;
        const end = at + stressVowelSpelling.length;
        return (
          <span key={index}>
            {part.slice(0, at)}
            <StressMark text={part.slice(at, end)} color={color} vowel={vowel} />
            {part.slice(end)}
          </span>
        );
      })}
    </>
  );
}

// -----------------------------------------------------------------------
// 音素表記（強勢のある母音だけ Color Vowel の色で下線）
// -----------------------------------------------------------------------

function PhonemeNotation({ phonemes, color }: { phonemes: Phoneme[]; color: string }) {
  return (
    <p className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
      <span className="text-[11px] font-bold text-ink-muted">音素</span>
      <span className="font-mono text-base tracking-wide text-ink-muted">
        {phonemes.map((p, i) => (
          <React.Fragment key={i}>
            {i > 0 && ' '}
            {p.stressed ? (
              <span
                className="font-bold text-ink underline decoration-[3px] underline-offset-4"
                style={{ textDecorationColor: color }}
              >
                {p.code}
              </span>
            ) : (
              p.code
            )}
          </React.Fragment>
        ))}
      </span>
    </p>
  );
}

// -----------------------------------------------------------------------
// エントリ
// -----------------------------------------------------------------------

function EntryView({
  result,
  playingAudio,
  onPlayAudio,
}: {
  result: ColorVowelDicResult;
  playingAudio: DictionaryAudioType | null;
  onPlayAudio: (url: string | null, type: DictionaryAudioType) => void;
}) {
  const color = getColorVowelBorderColor(result.vowel.cvId);
  const headwordRef = React.useRef<HTMLHeadingElement>(null);
  useFitHeadword(headwordRef, result.wordEn);
  // 発音記号（IPA）は Color Vowel と別の方式のため表示せず、音素表記に変換して表示する（CVJ-20261010-09）
  const phonemes = ipaToPhonemes(result.phoneticSpelling);

  return (
    <article>
      <div className="flex flex-col items-center text-center">
        <p className="text-[11px] font-bold text-ink-muted">{getPartOfSpeechLabel(result.partOfSpeech)}</p>
        <h3 ref={headwordRef} className={cn('mt-2 max-w-full break-words text-4xl font-bold tracking-tight text-ink', HEADWORD_ICON_SPACE)}>
          <StressedWord result={result} color={color} />
        </h3>
        <div className="mt-1 min-h-6">{phonemes && <PhonemeNotation phonemes={phonemes} color={color} />}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <AudioButton
          label="単語を再生"
          playing={playingAudio === 'word'}
          disabled={!result.wordAudioUrl}
          onClick={() => onPlayAudio(result.wordAudioUrl, 'word')}
        />
        <AudioButton
          label="母音を再生"
          playing={playingAudio === 'vowel'}
          disabled={!result.vowel.vowelAudioUrl}
          onClick={() => onPlayAudio(result.vowel.vowelAudioUrl, 'vowel')}
        />
      </div>

      <div className="mt-5 min-h-7">
        {result.wordJa && <p className="text-lg font-bold leading-snug text-ink">{result.wordJa}</p>}
        {result.lemma && (
          <p className="mt-1 text-xs text-ink-muted">
            原形: <span className="font-semibold text-ink-soft">{result.lemma}</span>
          </p>
        )}
      </div>

      <section className="mt-6 border-t border-line pt-4">
        <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
          <span className="size-3 shrink-0 rounded-full ring-1 ring-line" style={{ backgroundColor: color }} aria-hidden />
          {result.vowel.cvName} の発音
        </h4>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{result.vowel.description}</p>
      </section>
    </article>
  );
}

function AudioButton({
  label,
  playing,
  disabled,
  onClick,
}: {
  label: string;
  playing: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={playing}
      // 再生中（読み込み中を含む）はスピナー。スプリント結果の英文の再生ボタン（PhraseAudioHeader）と同じ表示にする。
      // 再タップで停止できるよう pending（押せなくなる）は使わない
      icon={playing ? <Loader2 className="animate-spin text-brand" aria-hidden /> : <Volume2 className="text-brand" aria-hidden />}
      className={cn(
        'h-12 rounded-control border-line bg-surface font-bold text-ink shadow-none hover:bg-canvas',
        playing && 'border-brand-200 bg-brand-50 text-brand-deep hover:bg-brand-50'
      )}
    >
      {label}
    </Button>
  );
}

// -----------------------------------------------------------------------
// 検索中・見つからない・エラー
// -----------------------------------------------------------------------

/** EntryView と同じ枠・高さの骨組み。見出しはタップした単語を先に出す */
function EntrySkeleton({ word }: { word: string }) {
  const headwordRef = React.useRef<HTMLHeadingElement>(null);
  useFitHeadword(headwordRef, word);
  return (
    <div aria-busy="true" aria-label="検索中">
      <div className="flex flex-col items-center text-center">
        <Skeleton className="h-3.5 w-10" />
        <h3 ref={headwordRef} className={cn('relative mt-2 max-w-full break-words text-4xl font-bold tracking-tight text-ink-subtle', HEADWORD_ICON_SPACE)}>
          {word}
          <Skeleton className="absolute bottom-1.5 left-1/2 size-[42px] -translate-x-1/2 rounded-full" />
        </h3>
        <Skeleton className="mt-1 h-6 w-36" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Skeleton className="h-12 rounded-control" />
        <Skeleton className="h-12 rounded-control" />
      </div>
      <Skeleton className="mt-5 h-7 w-40" />
      <div className="mt-6 space-y-2 border-t border-line pt-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

function LookupMessage({ word, kind }: { word: string; kind: 'notFound' | 'error' }) {
  const Icon = kind === 'error' ? TriangleAlert : SearchX;
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-control bg-canvas">
        <Icon className="size-7 text-ink-subtle" aria-hidden />
      </div>
      {kind === 'error' ? (
        <>
          <p className="text-base font-bold text-ink">検索できませんでした</p>
          <p className="text-sm text-ink-muted">時間をおいて、もう一度お試しください。</p>
        </>
      ) : (
        <>
          <p className="text-base font-bold text-ink">辞書に見つかりませんでした</p>
          <p className="text-sm text-ink-muted">
            「<span className="font-semibold text-ink">{word}</span>」は Color Vowel 辞書に登録されていません。
          </p>
          <p className="max-w-[260px] text-xs leading-relaxed text-ink-subtle">
            辞書には教材に出てくる主な英単語を収録しています。固有名詞・略語は対象外の場合があります。
          </p>
        </>
      )}
    </div>
  );
}
