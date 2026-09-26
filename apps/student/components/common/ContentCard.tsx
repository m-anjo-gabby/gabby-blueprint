"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, ArrowRight, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { ContentItem } from "@gabby/types/content";
import { motion } from "framer-motion";
import { getContentTypeConfig, getCefrStyle } from "@gabby/lib/content/ui";
import { cn } from "@/lib/utils";

interface ContentCardProps {
  content: ContentItem;
  onToggleFavorite: (id: string, current: boolean) => void;
  onStart: (content: ContentItem) => void; // 🔄 常に新規のため第2引数のフラグは不要に
  actionMode?: 'dashboard' | 'library' | 'favorite';
}

export const ContentCard = ({ 
  content, 
  onToggleFavorite, 
  onStart,
  actionMode = 'library'
}: ContentCardProps) => {
  const clampLines = 3; 

  // --- States & Refs ---
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  const { icon: TypeIcon, label: typeLabel } = getContentTypeConfig(content.content_type);
  
  // metadata から安全に取得
  const cefr = content.metadata?.cefr;
  const cefrStyle = cefr ? getCefrStyle(cefr.id) : "";

  // --- Description Clamp Observer ---
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
      <Card className="group overflow-hidden rounded-card border border-line bg-surface shadow-xs transition-all duration-300 hover:border-brand-200 hover:shadow-sm">
        {/* 1. Header Area: 種別・CEFR・お気に入り */}
        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-slate-100 text-ink-soft">
              <TypeIcon size={16} />
            </span>
            <span className="whitespace-nowrap text-xs font-semibold text-ink-muted">{typeLabel}</span>

            {cefr && (
              <Badge
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full border-none px-2 py-0.5 text-[11px] font-bold shadow-none",
                  cefrStyle
                )}
              >
                <span className="text-[11px] font-semibold opacity-70">CEFR</span>
                {cefr.label}
              </Badge>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(content.content_id, content.is_favorite || false);
            }}
            aria-label={actionMode === 'favorite' ? 'お気に入りから削除' : content.is_favorite ? 'お気に入りを解除' : 'お気に入りに追加'}
            className={cn(
              "shrink-0 rounded-full p-2 transition-all active:scale-75",
              actionMode === 'favorite'
                ? "text-ink-subtle hover:bg-rose-50 hover:text-rose-500"
                : content.is_favorite
                  ? "bg-amber-50 text-amber-500"
                  : "text-ink-subtle hover:bg-slate-100"
            )}
          >
            {actionMode === 'favorite' ? (
              <Trash2 size={18} />
            ) : (
              <Star size={18} fill={content.is_favorite ? "currentColor" : "none"} />
            )}
          </button>
        </div>

        {/* 2. Content Area */}
        <CardContent className="px-5 pt-4 pb-5 sm:px-6">
          <h3 className="mb-2 text-base sm:text-lg font-bold leading-snug tracking-tight text-ink transition-colors group-hover:text-brand-strong">
            {content.content_name}
          </h3>

          <div
            onClick={() => isClamped && setIsExpanded(!isExpanded)}
            className={cn(
              "mb-4 rounded-xl transition-all duration-200",
              isClamped ? "-mx-2 cursor-pointer px-2 py-1 hover:bg-slate-50" : "cursor-default"
            )}
          >
            <p
              ref={descriptionRef}
              className={cn(
                "text-sm leading-relaxed text-ink-muted transition-all",
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
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand">
                {isExpanded ? (
                  <>閉じる <ChevronUp size={14} /></>
                ) : (
                  <>続きを読む <ChevronDown size={14} /></>
                )}
              </div>
            )}
          </div>

          {content.display_tags && content.display_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {content.display_tags.map((t) => (
                <Badge
                  key={t.tag_id}
                  variant="secondary"
                  className="rounded-full border-none bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-ink-soft shadow-none"
                >
                  #{t.tag_name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>

        {/* 3. Footer Area */}
        <CardFooter className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
          <Button
            onClick={() => onStart(content)}
            className="group/btn h-12 w-full rounded-control border-none bg-brand text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-strong"
          >
            トレーニングを始める
            <ArrowRight size={16} className="ml-2 transition-transform group-hover/btn:translate-x-1" />
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
};
