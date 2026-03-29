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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { X, ChevronRight } from 'lucide-react';

interface DrillIndexProps {
  isOpen: boolean;
  onSelect: (idx: number) => void;
}

export const DrillIndex: React.FC<DrillIndexProps> = ({ isOpen, onSelect }) => {
  const activeWordRef = useRef<HTMLButtonElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRef = useRef<HTMLDivElement | null>(null);

  const { words, wordIdx, sortOrder, setSortOrder, setShowIndex } = useWordDrillStore();

  // 1. 表示用データの加工: ソートロジックの集約
  const displayWords = useMemo(() => {
    const list = words.map((w, originalIdx) => ({ ...w, originalIdx }));
    return sortOrder === 'alpha'
      ? [...list].sort((a, b) => a.word_en.localeCompare(b.word_en))
      : list;
  }, [words, sortOrder]);

  // 2. A-Zナビゲーション用のユニークな頭文字リスト
  const alphabetIndex = useMemo(() => {
    if (sortOrder !== 'alpha') return [];
    return Array.from(new Set(displayWords.map(w => w.word_en.charAt(0).toUpperCase()))).sort();
  }, [displayWords, sortOrder]);

  // 3. PC操作支援: 水平インデックスをマウスホイールでスクロール
  useEffect(() => {
    const el = horizontalScrollRef.current;
    if (!el || sortOrder !== 'alpha') return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [sortOrder]);

  // 4. セクションジャンプ機能: Radix ScrollAreaの内包Viewportを対象にスクロール
  const scrollToSection = (char: string) => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    const sectionEl = document.getElementById(`section-${char}`);
    if (viewport && sectionEl) {
      viewport.scrollTo({ top: sectionEl.offsetTop - 8, behavior: 'smooth' });
    }
  };

  // 5. 初期表示・切り替え時の自動スクロール (iOSのレンダリング遅延を考慮したsetTimeout)
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
        if (viewport && activeWordRef.current) {
          const target = activeWordRef.current;
          const scrollTo = target.offsetTop - (viewport.clientHeight / 2) + (target.clientHeight / 2);
          viewport.scrollTo({ top: scrollTo, behavior: 'auto' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, sortOrder, wordIdx]);

  return (
    <Drawer 
      open={isOpen} 
      onOpenChange={setShowIndex}
      // ハンドル以外でのドラッグによるクローズを無効化し、操作を安定させる
      dismissible={true}
    >
      <DrawerContent 
        className="max-w-2xl mx-auto h-[85vh] bg-white border-none rounded-t-[40px] shadow-2xl outline-none flex flex-col overflow-hidden text-slate-900"
        onPointerDownOutside={(e) => {
          // PC操作対応: スクロールバー操作中の誤判定（外部クリックとみなされる挙動）を防ぐ
          const target = e.target as HTMLElement;
          if (target?.closest('[data-radix-scroll-area-viewport]')) {
            e.preventDefault();
          }
        }}
      >
        
        {/* 固定ヘッダーセクション: ハンドルエリアのみドラッグ可能に制限 */}
        <div className="shrink-0">
          <div className="flex justify-center py-4 cursor-grab active:cursor-grabbing">
            <div className="w-10 h-1 rounded-full bg-slate-100" />
          </div>

          <DrawerHeader className="px-8 py-0 flex items-center justify-between h-10">
            <div className="flex flex-col text-left">
              <DrawerTitle className="text-xl font-black tracking-tight text-slate-800 leading-none">Index</DrawerTitle>
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Vocabulary List</span>
            </div>
            <DrawerClose asChild>
              <button className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <X size={20} strokeWidth={2.5} />
              </button>
            </DrawerClose>
          </DrawerHeader>

          {/* モード切替タブ: data-vaul-no-drag でスワイプ干渉を回避 */}
          <div className="px-8 pt-6 pb-4" data-vaul-no-drag>
            <Tabs value={sortOrder} onValueChange={(v) => setSortOrder(v as 'default' | 'alpha')}>
              <TabsList className="flex w-full bg-slate-100/50 p-1 rounded-2xl h-11 border border-slate-100">
                <TabsTrigger value="default" className="flex-1 text-xs font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm transition-all">
                  By Rank
                </TabsTrigger>
                <TabsTrigger value="alpha" className="flex-1 text-xs font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm transition-all">
                  A - Z
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* A-Z 水平インデックスナビ */}
          {sortOrder === 'alpha' && alphabetIndex.length > 0 && (
            <div className="relative px-8 pb-4 group" data-vaul-no-drag>
              {/* PC向け視認性向上: 左右のフェードエフェクト */}
              <div className="absolute left-8 top-0 bottom-4 w-4 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute right-8 top-0 bottom-4 w-4 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <ScrollArea className="w-full">
                <div 
                  ref={horizontalScrollRef}
                  className="flex gap-2 pb-2 overflow-x-auto no-scrollbar scroll-smooth"
                >
                  {alphabetIndex.map(char => (
                    <button
                      key={char}
                      onClick={() => scrollToSection(char)}
                      className="inline-flex items-center justify-center min-w-[36px] h-9 rounded-xl bg-slate-50 text-[11px] font-black text-slate-400 hover:text-white hover:bg-indigo-500 active:scale-90 transition-all border border-slate-100"
                    >
                      {char}
                    </button>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" className="h-1.5 opacity-50" />
              </ScrollArea>
            </div>
          )}
        </div>

        {/* 単語リストスクロール領域: data-vaul-no-drag でDrawerのスワイプクローズを抑制 */}
        <div className="flex-1 relative min-h-0 overflow-hidden border-t border-slate-50" data-vaul-no-drag>
          <ScrollArea ref={scrollAreaRef} className="h-full w-full pr-2">
            <div className="px-6 py-4 space-y-2 pb-32">
              {displayWords.map((w, idx) => {
                const initial = w.word_en.charAt(0).toUpperCase();
                const isFirst = sortOrder === 'alpha' && (idx === 0 || displayWords[idx - 1].word_en.charAt(0).toUpperCase() !== initial);
                const isActive = wordIdx === w.originalIdx;

                return (
                  <div key={w.word_id}>
                    {/* アルファベットセクション見出し */}
                    {isFirst && (
                      <div id={`section-${initial}`} className="pt-6 pb-2 pl-2 flex items-center gap-4">
                        <span className="text-xl font-black text-indigo-100 uppercase select-none">{initial}</span>
                        <div className="h-px flex-1 bg-slate-50" />
                      </div>
                    )}

                    {/* 単語アイテムボタン */}
                    <button
                      ref={isActive ? activeWordRef : null}
                      onClick={() => onSelect(w.originalIdx)}
                      className={cn(
                        "w-full flex items-center gap-4 px-5 py-4 rounded-[22px] transition-all duration-300 outline-none border-2 text-left",
                        isActive
                          ? "bg-indigo-50/40 border-indigo-400 shadow-sm"
                          : "bg-white border-transparent hover:border-slate-100 hover:bg-slate-50 group"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          {sortOrder === 'default' && (
                            <span className={cn(
                              "text-[10px] font-mono font-bold w-5 text-right shrink-0",
                              isActive ? "text-indigo-400" : "text-slate-300"
                            )}>
                              {(w.originalIdx + 1).toString().padStart(2, '0')}
                            </span>
                          )}
                          <span className={cn(
                            "text-[17px] font-bold tracking-tight truncate block",
                            isActive ? "text-indigo-700" : "text-slate-700"
                          )}>
                            {w.word_en}
                          </span>
                        </div>
                        <p className={cn(
                          "text-xs font-medium truncate mt-0.5 block",
                          isActive ? "text-indigo-500/70" : "text-slate-400",
                          sortOrder === 'default' ? "ml-8" : "ml-0"
                        )}>
                          {w.word_ja}
                        </p>
                      </div>
                      
                      {/* 右端アクション表示 */}
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center transition-all shrink-0",
                        isActive ? "bg-indigo-500 text-white shadow-sm" : "bg-slate-50 text-slate-200 opacity-0 group-hover:opacity-100"
                      )}>
                        <ChevronRight size={16} strokeWidth={3} />
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
            {/* 垂直スクロールバー: マウス操作時の干渉を防ぐため属性を付与 */}
            <ScrollBar orientation="vertical" className="w-2.5 bg-slate-50/30" data-vaul-no-drag />
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
};