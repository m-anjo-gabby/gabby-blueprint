'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { useWordDrillStore } from '@/stores/useWordDrillStore';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { X } from 'lucide-react';

interface DrillIndexProps {
  isOpen: boolean;
  onSelect: (idx: number) => void;
}

export const DrillIndex: React.FC<DrillIndexProps> = ({ isOpen, onSelect }) => {
  const activeWordRef = useRef<HTMLButtonElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const { words, wordIdx, sortOrder, setSortOrder, setShowIndex } = useWordDrillStore();

  const displayWords = useMemo(() => {
    const list = words.map((w, originalIdx) => ({ ...w, originalIdx }));
    return sortOrder === 'alpha'
      ? [...list].sort((a, b) => a.word_en.localeCompare(b.word_en))
      : list;
  }, [words, sortOrder]);

  const alphabetIndex = useMemo(() => {
    if (sortOrder !== 'alpha') return [];
    return Array.from(
      new Set(displayWords.map(w => w.word_en.charAt(0).toUpperCase()))
    ).sort();
  }, [displayWords, sortOrder]);

  // スクロール制御 (Double RAF)
  useEffect(() => {
    if (!isOpen) return;

    let rafId1: number;
    let rafId2: number;

    const performScroll = () => {
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          const viewport = scrollAreaRef.current?.querySelector(
            '[data-radix-scroll-area-viewport]'
          ) as HTMLElement | null;
          const target = activeWordRef.current;

          if (viewport && target) {
            const targetTop = target.offsetTop;
            const viewportHeight = viewport.clientHeight;
            const targetHeight = target.clientHeight;
            const scrollTo = targetTop - (viewportHeight / 2) + (targetHeight / 2);

            viewport.scrollTo({ top: scrollTo, behavior: 'auto' });
          }
        });
      });
    };

    performScroll();
    return () => {
      if (rafId1) cancelAnimationFrame(rafId1);
      if (rafId2) cancelAnimationFrame(rafId2);
    };
  }, [isOpen, sortOrder, wordIdx]);

  return (
    <Drawer open={isOpen} onOpenChange={setShowIndex}>
      <DrawerContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "max-w-2xl mx-auto h-[85%] flex flex-col overflow-hidden",
          "bg-white/95 backdrop-blur-xl border-t border-slate-100 rounded-t-[32px] outline-none"
        )}
      >
        {/* 1. カスタムドラッグハンドル：
            標準のものより少し太く、色を調整して「掴める」ことを強調 */}
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mt-3 mb-1" />

        <DrawerHeader className="px-6 pt-2 pb-2 shrink-0 relative">
          <DrawerTitle className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-center">
            Select Word
          </DrawerTitle>

          {/* 2. クローズボタン：
              右上に配置。スワイプ操作に不慣れなユーザーへのセーフティネット */}
          <DrawerClose asChild>
            <button className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-slate-100 active:scale-90 transition-all text-slate-400">
              <X size={18} strokeWidth={2.5} />
            </button>
          </DrawerClose>
        </DrawerHeader>

        <div className="px-6 mb-4 shrink-0">
          <Tabs value={sortOrder} onValueChange={(v) => setSortOrder(v as 'default' | 'alpha')}>
            <TabsList className="grid w-full grid-cols-2 bg-slate-100/80 p-1 rounded-xl">
              <TabsTrigger value="default" className="text-[10px] font-bold uppercase rounded-lg">
                By Rank
              </TabsTrigger>
              <TabsTrigger value="alpha" className="text-[10px] font-bold uppercase rounded-lg">
                A to Z
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <ScrollArea ref={scrollAreaRef} className="flex-1 px-4">
            <div className="space-y-1 pb-12">
              {displayWords.map((w, idx) => {
                const initial = w.word_en.charAt(0).toUpperCase();
                const isFirst = sortOrder === 'alpha' && 
                  (idx === 0 || displayWords[idx - 1].word_en.charAt(0).toUpperCase() !== initial);
                const isActive = wordIdx === w.originalIdx;

                return (
                  <div key={w.word_id}>
                    {isFirst && (
                      <div id={`section-${initial}`} className="px-4 pt-6 pb-2 scroll-mt-4">
                        <span className="text-xl font-black text-indigo-300 italic">{initial}</span>
                        <div className="h-px w-full bg-slate-50 mt-1" />
                      </div>
                    )}

                    <button
                      ref={isActive ? activeWordRef : null}
                      onClick={() => onSelect(w.originalIdx)}
                      className={cn(
                        "w-full text-left px-4 py-4 rounded-2xl transition-all flex items-center gap-4 mb-1 outline-none",
                        isActive
                          ? "bg-indigo-50/80 border-indigo-100 ring-1 ring-indigo-100 shadow-sm"
                          : "hover:bg-slate-50 active:scale-[0.98] border border-transparent"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          {sortOrder === 'default' && (
                            <span className={cn(
                              "text-[10px] font-bold w-5 text-right shrink-0",
                              isActive ? "text-indigo-400" : "text-slate-300"
                            )}>
                              {w.originalIdx + 1}
                            </span>
                          )}
                          <p className={cn(
                            "text-sm font-bold tracking-tight",
                            isActive ? "text-indigo-600" : "text-slate-700"
                          )}>
                            {w.word_en}
                          </p>
                        </div>
                        <p className={cn(
                          "text-[10px] font-medium text-slate-400 mt-1.5 leading-none",
                          sortOrder === 'default' ? "ml-7" : "ml-0"
                        )}>
                          {w.word_ja}
                        </p>
                      </div>
                      {isActive && (
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.5)]" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* 右側のアルファベットナビゲーション */}
          {sortOrder === 'alpha' && alphabetIndex.length > 0 && (
            <div className="w-9 flex flex-col justify-center gap-0.5 pr-2 border-l border-slate-50 bg-white/30 backdrop-blur-sm shrink-0">
              {alphabetIndex.map(char => (
                <button
                  key={char}
                  onClick={(e) => {
                    e.stopPropagation();
                    const el = document.getElementById(`section-${char}`);
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="text-[9px] font-black text-slate-400 hover:text-indigo-600 h-5 flex items-center justify-center rounded-md hover:bg-indigo-50 transition-colors"
                >
                  {char}
                </button>
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};