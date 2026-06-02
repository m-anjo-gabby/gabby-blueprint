"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { cn } from "@gabby/lib/utils"; // パスは環境に合わせて調整してください

interface TermViewerProps {
  content: string;
  onScrollEnd?: () => void;
  isLoading?: boolean;
  /** ScrollArea.Viewport に適用するクラス名 (背景色やレイアウト調整用) */
  containerClassName?: string;
  /** Markdownを表示するコンテナに適用するクラス名 (幅制限やカード風デザイン用) */
  contentClassName?: string;
}

export function TermViewer({ 
  content, 
  onScrollEnd, 
  isLoading = false,
  containerClassName,
  contentClassName
}: TermViewerProps) {
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!onScrollEnd) return;

    const target = e.currentTarget;
    // 最下部から20px以内に到達したらコールバックを実行
    const isBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 20;
    if (isBottom) {
      onScrollEnd();
    }
  };

  return (
    <ScrollArea.Root className="flex-1 w-full min-w-0 overflow-hidden flex flex-col bg-transparent">
      <ScrollArea.Viewport
        className={cn("h-full w-full overflow-y-auto overscroll-contain", containerClassName)}
        onScroll={handleScroll}
      >
        <div className={cn("px-8 py-10 w-full max-w-full min-w-0 break-words", contentClassName)}>
          {content ? (
            <article className="prose prose-indigo prose-sm sm:prose-base max-w-none break-words [word-break:break-word]">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  // H1 (#) の見た目を強制上書き
                  h1: ({ node, ...props }) => (
                    <h1 {...props} className="!text-xl sm:!text-2xl !font-black !tracking-tight !text-slate-900 !mt-2 !mb-6" />
                  ),
                  // H3 (###) の見た目を強制上書き
                  h3: ({ node, ...props }) => (
                    <h3 {...props} className="!text-sm sm:!text-base !font-bold !text-slate-700 !mt-8 !mb-3" />
                  ),
                  // 段落 (<p>) の改行制御を強制上書き
                  p: ({ node, ...props }) => (
                    <p {...props} className="!whitespace-pre-wrap !leading-relaxed !text-slate-600 !my-4" />
                  )
                }}
              >
                {content}
              </ReactMarkdown>
            </article>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-slate-400">
              <div className="w-8 h-8 animate-spin border-2 border-indigo-500 border-t-transparent rounded-full" />
              <p className="text-xs font-bold tracking-widest uppercase animate-pulse">
                {isLoading ? "Fetching Document Content..." : "No Content Available"}
              </p>
            </div>
          )}
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="w-2.5 bg-slate-100/50" orientation="vertical">
        <ScrollArea.Thumb className="bg-slate-200 rounded-full" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}