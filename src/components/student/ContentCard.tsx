"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, ArrowRight, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { ContentItem } from "@/types/content";
import { motion } from "framer-motion";
import { getTagStyle, getContentTypeConfig } from "@/utils/content";
import { cn } from "@/lib/utils";

interface ContentCardProps {
  content: ContentItem;
  onToggleFavorite: (id: string, current: boolean) => void;
  onStart: (content: ContentItem) => void;
  // モード切り替え ('dashboard' | 'library | favorite')
  actionMode?: 'dashboard' | 'library' | 'favorite';
}

export const ContentCard = ({ 
  content, 
  onToggleFavorite, 
  onStart,
  actionMode = 'library' // デフォルトはライブラリ用の星アイコン
}: ContentCardProps) => {
  // --- Config ---
  const clampLines = 3; 

  // --- States & Refs ---
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  const { icon: TypeIcon, label: typeLabel, theme } = getContentTypeConfig(content.content_type);

  // --- Effects ---
  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;

    const checkClamped = () => {
      if (!isExpanded) {
        if (el.clientHeight > 0) {
          setIsClamped(el.scrollHeight > el.clientHeight + 1);
        }
      }
    };

    const observer = new ResizeObserver(checkClamped);
    observer.observe(el);
    checkClamped();
    return () => observer.disconnect();
  }, [content.description, isExpanded, clampLines]);

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className={cn(
          "group overflow-hidden transition-all duration-300 rounded-[32px] bg-white border shadow-sm hover:shadow-md",
          theme.border,
          theme.hoverBorder
        )}
      >
        {/* 1. Header Area */}
        <div className={cn("px-6 py-3.5 border-b flex justify-between items-center gap-4", theme.bg, theme.border)}>
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-2">
              <TypeIcon size={18} strokeWidth={2.5} className={cn("shrink-0", theme.text)} />
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest whitespace-nowrap hidden sm:inline", 
                theme.text
              )}>
                {typeLabel}
              </span>
            </div>

            <div className={cn("w-px h-3 opacity-20", theme.dotActive)} />

            <div className="flex items-center gap-2.5">
              <span className={cn("text-[9px] font-bold uppercase tracking-wider opacity-60", theme.text)}>
                Level
              </span>
              <div className="flex gap-1.5">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-colors duration-500",
                      i < content.difficulty_level ? theme.dotActive : theme.dotInactive
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 右端のボタン：モードによって Star または Trash2 を切り替え */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(content.content_id, content.is_favorite || false);
            }}
            className={cn(
              "transition-all active:scale-75 p-2 rounded-full",
              actionMode === 'favorite' 
                ? "text-slate-300 hover:text-rose-500 hover:bg-rose-50" // 削除モード
                : content.is_favorite 
                  ? "text-amber-500 bg-amber-50" // お気に入りON
                  : "text-slate-300 hover:bg-white/50" // お気に入りOFF
            )}
          >
            {actionMode === 'favorite' ? (
              <Trash2 size={18} strokeWidth={2.5} />
            ) : (
              <Star size={18} fill={content.is_favorite ? "currentColor" : "none"} />
            )}
          </button>
        </div>

        <CardContent className="p-6">
          <h3 className="text-lg font-black text-slate-800 mb-3 leading-tight group-hover:text-indigo-600 transition-colors">
            {content.content_name}
          </h3>

          <div
            onClick={() => isClamped && setIsExpanded(!isExpanded)}
            className={cn(
              "mb-4 transition-all duration-200 rounded-xl",
              isClamped 
                ? "cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1" 
                : "cursor-default"
            )}
          >
            <p
              ref={descriptionRef}
              className={cn(
                "text-[13px] text-slate-500 leading-relaxed transition-all",
                !isExpanded && `line-clamp-${clampLines}`
              )}
              style={!isExpanded ? {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: clampLines,
                overflow: 'hidden'
              } : {}}
            >
              {content.description}
            </p>
            
            {isClamped && (
              <div className="flex items-center gap-1 mt-1 text-indigo-500 font-bold text-[10px] uppercase tracking-wider">
                {isExpanded ? (
                  <>Show less <ChevronUp size={12} /></>
                ) : (
                  <>Read more <ChevronDown size={12} /></>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {content.display_tags?.map((t) => {
              const style = getTagStyle(t.tag_type);
              return (
                <Badge
                  key={t.tag_id}
                  variant="secondary"
                  className={cn(style.className, "text-[9px] border-none px-2.5 py-0.5 shadow-sm font-bold")}
                >
                  #{t.tag_name}
                </Badge>
              );
            })}
          </div>
        </CardContent>

        <CardFooter className="px-6 pb-6 pt-0">
          <Button
            onClick={() => onStart(content)}
            className={cn(
              "w-full rounded-2xl text-white border-none shadow-md group/btn transition-all h-12 font-black text-[11px] tracking-widest uppercase",
              theme.button
            )}
          >
            Start Training
            <ArrowRight size={16} className="ml-2 group-hover/btn:translate-x-1 transition-transform" />
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
};