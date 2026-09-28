'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { MessageCircle, MessageCircleOff } from 'lucide-react';
import { useSelectedLayoutSegment } from 'next/navigation';
import { useUserStore } from '../../stores/useUserStore';
import { useChatStore } from '../../stores/useChatStore';
import { useChatRoomsRealtime } from '../../chat/realtime/useChatRoomsRealtime';
import { CHAT_BASE_PATH } from '../../chat/links';
import { cn } from '../../utils';
import { CHAT_SPLIT_CLASSES, ChatUiProvider, useChatUi, type ChatLabels, type ChatSplitBreakpoint } from './ChatUiContext';

interface ChatSplitLayoutProps {
  labels: ChatLabels;
  breakpoint: ChatSplitBreakpoint;
  /** 左ペイン（ChatRoomListPane） */
  list: React.ReactNode;
  /** 右ペイン（chat/page.tsx = 未選択、chat/[roomId]/page.tsx = タイムライン） */
  children: React.ReactNode;
  basePath?: string;
  /** 外枠の見た目（角丸・枠線等）。アプリの画面構成に合わせて指定する */
  className?: string;
  /** 一覧に無いルームの新着で一覧を再取得するか（Adminは全ルームを受信するため false） */
  refetchOnUnknownRoom?: boolean;
}

/**
 * チャットの2ペイン表示（左: ルーム一覧 / 右: 選択中のルーム）。chat/layout.tsx に置く。
 * - breakpoint 以上: 2ペインを並べる。ルームを切り替えても一覧は再マウントされず、スクロール位置も保たれる
 * - breakpoint 未満: /chat では一覧、/chat/[roomId] ではルームだけを表示する（従来のモバイルの操作感）
 * ルーム一覧の取得と、一覧を最新に保つRealtime購読もここで行う。
 */
export function ChatSplitLayout({
  labels,
  breakpoint,
  list,
  children,
  basePath = CHAT_BASE_PATH,
  className,
  refetchOnUnknownRoom = true,
}: ChatSplitLayoutProps) {
  const selectedRoomId = useSelectedLayoutSegment();
  const currentUserId = useUserStore((state) => state.user?.id);
  const fetchRooms = useChatStore((state) => state.fetchRooms);
  const classes = CHAT_SPLIT_CLASSES[breakpoint];

  // ルームを開くたびに、無効化済み・期限切れなら一覧を取り直す（新規作成直後のルームを一覧へ反映するため。
  // 作成直後に即時取得すると遷移と競合するため、作成側は invalidate() だけ行い、遷移後にここで取得する）
  useEffect(() => {
    fetchRooms();
  }, [fetchRooms, selectedRoomId]);

  useChatRoomsRealtime(currentUserId, { refetchOnUnknownRoom });

  return (
    <ChatUiProvider labels={labels} basePath={basePath} breakpoint={breakpoint}>
      <div className={cn('flex min-h-0 flex-1 overflow-hidden bg-surface', className)}>
        <div
          className={cn(
            'min-h-0 w-full shrink-0 flex-col border-line',
            selectedRoomId ? classes.listHidden : classes.listShown
          )}
        >
          {list}
        </div>
        <div className={cn('min-h-0 min-w-0 flex-1 flex-col', selectedRoomId ? classes.paneShown : classes.paneHidden)}>
          {children}
        </div>
      </div>
    </ChatUiProvider>
  );
}

/** ルーム未選択時の右ペイン（chat/page.tsx）。狭い画面では表示されない */
export function ChatEmptyPane() {
  const { labels } = useChatUi();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-canvas/60 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-500">
        <MessageCircle size={26} />
      </div>
      <p className="text-sm font-bold text-ink-soft">{labels.selectRoomTitle}</p>
      <p className="max-w-72 text-xs leading-relaxed text-ink-muted">{labels.selectRoomHint}</p>
    </div>
  );
}

/**
 * 開けないルームの表示（chat/[roomId]/not-found.tsx）。存在しない・退出済み・参加していないルームを
 * 通知やメール内のリンクから開いた場合に、画面全体の404ではなく右ペインに案内を出し、一覧へ戻れるようにする。
 */
export function ChatRoomUnavailable() {
  const { labels, basePath } = useChatUi();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-canvas text-ink-subtle">
        <MessageCircleOff size={26} />
      </div>
      <p className="text-sm font-bold text-ink-soft">{labels.roomUnavailableTitle}</p>
      <p className="max-w-80 text-xs leading-relaxed text-ink-muted">{labels.roomUnavailableHint}</p>
      <Link
        href={basePath}
        className="mt-2 rounded-full border border-line px-4 py-2 text-xs font-bold text-ink-soft transition-colors hover:bg-canvas"
      >
        {labels.backToList}
      </Link>
    </div>
  );
}
