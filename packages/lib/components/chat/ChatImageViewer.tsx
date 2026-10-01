'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ExternalLink, X } from 'lucide-react';
import { useChatUi } from './ChatUiContext';

interface ChatImageViewerProps {
  url: string;
  fileName: string;
  /** 一覧に出す小さい画像（押すと拡大表示を開く） */
  children: React.ReactNode;
}

/**
 * 添付画像の拡大表示。チャットから離れずに見られるよう、別タブではなく画面の上に重ねて表示する。
 * 背景のクリック・Esc・閉じるボタンで閉じる。原寸の画像は「元の画像を開く」から別タブで開ける。
 */
export function ChatImageViewer({ url, fileName, children }: ChatImageViewerProps) {
  const { labels } = useChatUi();
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button type="button" aria-label={labels.openImage} className="block cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
          {children}
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-4 focus:outline-none sm:p-10"
        >
          <DialogPrimitive.Title className="sr-only">{fileName}</DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            {/* 画像の外側（余白）を押しても閉じる */}
            <button type="button" aria-hidden tabIndex={-1} className="absolute inset-0 cursor-zoom-out" />
          </DialogPrimitive.Close>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={fileName}
            className="relative max-h-[calc(100dvh-8rem)] max-w-full rounded-lg object-contain shadow-2xl"
          />
          <div className="relative flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-surface/15 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-surface/25"
            >
              <ExternalLink size={14} />
              {labels.openOriginalImage}
            </a>
            <DialogPrimitive.Close className="flex items-center gap-1.5 rounded-full bg-surface/15 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-surface/25">
              <X size={14} />
              {labels.closeImage}
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
