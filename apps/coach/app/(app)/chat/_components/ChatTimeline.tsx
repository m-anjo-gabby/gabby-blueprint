'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, User as UserIcon } from 'lucide-react';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useChatRealtimeMessages } from '@gabby/lib/chat/realtime/useChatRealtimeMessages';
import { getChatMessages } from '@gabby/lib/chat/actions/messageActions';
import { isContinuationMessage, formatMessageHeaderTime } from '@gabby/lib/chat/messageGrouping';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { ChatMessage, ChatRoomListItem } from '@gabby/types/chat';
import { USER_TYPES, type UserType } from '@gabby/types/user';
import { ChatMessageInput } from './ChatMessageInput';
import { ChatMessageContent } from './ChatMessageContent';

interface ChatTimelineProps {
  roomId: string;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  /** Whether the current user is a participant of this room (sending is disabled otherwise) */
  isMember: boolean;
  members: ChatRoomListItem['members'];
}

const AVATAR_SIZE = 32;
const AVATAR_GAP = 10; // gap-2.5
const BUBBLE_PADDING_X = 16; // bubble's px-4, aligns header with the message text start
// Below this distance (px) from the bottom, we consider the user "stuck" to the bottom, so
// later content growth (e.g. attachment images finishing their async load) re-pins the view.
const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

const USER_TYPE_LABEL_EN: Record<UserType, string> = {
  [USER_TYPES.ADMIN]: 'Admin',
  [USER_TYPES.STUDENT]: 'Student',
  [USER_TYPES.COACH]: 'Coach',
};

function formatHeaderTime(iso: string, timeZone: string): string {
  return formatMessageHeaderTime(iso, { locale: 'en-US', yesterdayLabel: 'Yesterday', timeZone });
}

function MessageAvatar({ iconPath, name, size = 28 }: { iconPath?: string | null; name?: string | null; size?: number }) {
  const url = getProfileIconUrl(iconPath);
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? ''}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-indigo-50 flex items-center justify-center shrink-0"
    >
      <UserIcon size={Math.round(size * 0.55)} className="text-indigo-400" />
    </div>
  );
}

export function ChatTimeline({ roomId, initialMessages, initialHasMore, isMember, members }: ChatTimelineProps) {
  const currentUserId = useUserStore((state) => state.user?.id);
  const timeZone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const markRoomAsRead = useChatStore((state) => state.markRoomAsRead);
  const applyIncomingMessage = useChatStore((state) => state.applyIncomingMessage);

  // API returns messages in created_at descending order; reverse for display
  const [messages, setMessages] = useState<ChatMessage[]>([...initialMessages].reverse());
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Set before prepending older messages; consumed by the layout effect below to keep the
  // viewport anchored on the same message instead of jumping to the top (LINE/Meet-style).
  const pendingScrollRestoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  // Whether the view should stay pinned to the latest message. Content (e.g. attachment images)
  // can keep growing asynchronously after the initial mount, so a one-off scrollIntoView isn't
  // enough to land exactly at the bottom — this flag drives the ResizeObserver correction below.
  const stickToBottomRef = useRef(true);

  const memberByUserId = new Map(members.map((m) => [m.user_id, m]));
  const otherMember = members.find((m) => m.user_id !== currentUserId);

  const markLatestAsRead = (latest: ChatMessage) => {
    if (!isMember) return;
    markRoomAsRead(roomId, latest.chat_id);
  };

  useEffect(() => {
    if (messages.length > 0) {
      markLatestAsRead(messages[messages.length - 1]);
    }
    bottomRef.current?.scrollIntoView({ block: 'end' });
    // Runs once on mount only (switching rooms remounts the parent component)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the view pinned to the bottom while content keeps growing (attachment images resolve
  // and load asynchronously, so height changes after the initial mount scroll above). Only acts
  // while stickToBottomRef is true, so it never fights a user who has scrolled up to read history.
  useEffect(() => {
    const content = contentRef.current;
    const container = containerRef.current;
    if (!content || !container) return;

    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    stickToBottomRef.current = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD_PX;
  };

  // Restores the scroll position after older messages are prepended, so the viewport stays
  // anchored on what the user was looking at instead of jumping when the content grows above it.
  useLayoutEffect(() => {
    const restore = pendingScrollRestoreRef.current;
    const container = containerRef.current;
    if (!restore || !container) return;
    container.scrollTop = container.scrollHeight - restore.scrollHeight + restore.scrollTop;
    pendingScrollRestoreRef.current = null;
  }, [messages]);

  const loadMoreRef = useRef<() => void>(() => {});

  // Auto-loads older messages when the user scrolls near the top of the timeline, mirroring
  // LINE/Meet's infinite-scroll behavior instead of requiring an explicit button click.
  useEffect(() => {
    const container = containerRef.current;
    const sentinel = sentinelRef.current;
    if (!container || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreRef.current();
        }
      },
      { root: container, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useChatRealtimeMessages(roomId, (message) => {
    // The optimistic append in handleSent and the Realtime echo both deliver our own
    // message, so de-dupe by chat_id to avoid rendering it twice.
    setMessages((prev) => (prev.some((m) => m.chat_id === message.chat_id) ? prev : [...prev, message]));
    if (isMember) {
      applyIncomingMessage(roomId, message.sender_user_id === currentUserId);
    }
    if (message.sender_user_id !== currentUserId) {
      markLatestAsRead(message);
    }
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  });

  const handleLoadMore = async () => {
    if (messages.length === 0 || isLoadingMore || !hasMore) return;
    const container = containerRef.current;
    setIsLoadingMore(true);
    try {
      const oldest = messages[0];
      const res = await getChatMessages({ roomId, cursor: oldest.created_at });
      if (res.success) {
        if (container) {
          pendingScrollRestoreRef.current = { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop };
        }
        setMessages((prev) => [...[...res.data].reverse(), ...prev]);
        setHasMore(res.hasMore);
      }
    } finally {
      setIsLoadingMore(false);
    }
  };
  loadMoreRef.current = handleLoadMore;

  const handleSent = (message: ChatMessage) => {
    setMessages((prev) => (prev.some((m) => m.chat_id === message.chat_id) ? prev : [...prev, message]));
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-3 border-b border-slate-100 shrink-0">
        <Link
          href="/chat"
          aria-label="Back to chat list"
          className="flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
        >
          <ChevronLeft size={24} />
        </Link>
        <MessageAvatar iconPath={otherMember?.icon_path} name={otherMember?.user_name} size={AVATAR_SIZE} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{otherMember?.user_name || 'Unknown'}</p>
          {otherMember && (
            <p className="text-[11px] text-slate-400">{USER_TYPE_LABEL_EN[otherMember.user_type] ?? 'Unknown'}</p>
          )}
        </div>
      </div>

      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-5 py-4">
        <div ref={contentRef} className="max-w-200 mx-auto space-y-0.5">
          <div ref={sentinelRef} />
          {isLoadingMore && (
            <div className="flex justify-center pb-2">
              <Loader2 size={14} className="animate-spin text-slate-400" />
            </div>
          )}

          {messages.map((msg, idx) => {
            const isMine = msg.sender_user_id === currentUserId;
            const showHeader = !isContinuationMessage(msg, messages[idx - 1], timeZone);
            const sender = memberByUserId.get(msg.sender_user_id);

            return (
              <div
                key={msg.chat_id}
                className={`group flex flex-col ${showHeader ? 'pt-3' : ''} ${isMine ? 'items-end' : 'items-start'}`}
              >
                {showHeader && (
                  isMine ? (
                    <div className="mb-1">
                      <span className="text-[10px] text-slate-400">{formatHeaderTime(msg.created_at, timeZone)}</span>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 mb-1"
                      style={{ paddingLeft: AVATAR_SIZE + AVATAR_GAP + BUBBLE_PADDING_X }}
                    >
                      <span className="text-xs font-bold text-slate-700">{sender?.user_name || 'Unknown'}</span>
                      <span className="text-[10px] text-slate-400">{formatHeaderTime(msg.created_at, timeZone)}</span>
                    </div>
                  )
                )}
                <div className={`flex min-w-0 max-w-full ${isMine ? '' : 'items-start gap-2.5'}`}>
                  {!isMine && (
                    showHeader ? (
                      <MessageAvatar iconPath={sender?.icon_path} name={sender?.user_name} size={AVATAR_SIZE} />
                    ) : (
                      <div style={{ width: AVATAR_SIZE }} className="shrink-0" />
                    )
                  )}
                  <div
                    className={`relative flex min-w-0 max-w-full items-end ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    {!showHeader && (
                      <span
                        className={`absolute bottom-1 whitespace-nowrap text-[10px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 ${
                          isMine ? 'right-full mr-1.5' : 'left-full ml-1.5'
                        }`}
                      >
                        {formatHeaderTime(msg.created_at, timeZone)}
                      </span>
                    )}
                    <div
                      className={`max-w-160 min-w-0 rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                        isMine ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                      }`}
                    >
                      <ChatMessageContent message={msg} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {isMember ? (
        <ChatMessageInput roomId={roomId} onSent={handleSent} />
      ) : (
        <div className="border-t border-slate-100 p-4 text-center text-xs font-bold text-slate-400">
          You are not a participant of this room, so you cannot send messages here.
        </div>
      )}
    </div>
  );
}
