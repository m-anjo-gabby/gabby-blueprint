'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, User as UserIcon, Users as UsersIcon } from 'lucide-react';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useChatRealtimeMessages } from '@gabby/lib/chat/realtime/useChatRealtimeMessages';
import { getChatMessages } from '@gabby/lib/chat/actions/messageActions';
import { isContinuationMessage, formatMessageHeaderTime } from '@gabby/lib/chat/messageGrouping';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { CHAT_ROOM_TYPES, ChatMessage, ChatRoom, ChatRoomListItem } from '@gabby/types/chat';
import { USER_TYPES, type UserType } from '@gabby/types/user';
import { ChatMessageInput } from './ChatMessageInput';
import { ChatMessageContent } from './ChatMessageContent';

interface ChatTimelineProps {
  roomId: string;
  room: ChatRoom;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  /** ログイン中のユーザーがこのルームの参加者かどうか（参加者でない場合は送信不可） */
  isMember: boolean;
  members: ChatRoomListItem['members'];
}

const AVATAR_SIZE = 34;
const AVATAR_GAP = 10; // gap-2.5
const BUBBLE_PADDING_X = 16; // 吹き出しのpx-4に合わせ、見出しの開始位置を本文と揃える
// この距離(px)未満なら「最下部に張り付いている」とみなす。添付画像の読み込み完了などで
// あとからコンテンツの高さが伸びるケースに追従して自動スクロールさせるためのしきい値。
const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

const USER_TYPE_LABEL_JA: Record<UserType, string> = {
  [USER_TYPES.ADMIN]: '運営',
  [USER_TYPES.STUDENT]: '生徒',
  [USER_TYPES.COACH]: 'コーチ',
};

function formatHeaderTime(iso: string, timeZone: string): string {
  return formatMessageHeaderTime(iso, { locale: 'ja-JP', yesterdayLabel: '昨日', timeZone });
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

export function ChatTimeline({ roomId, room, initialMessages, initialHasMore, isMember, members }: ChatTimelineProps) {
  const isGroup = room.room_type === CHAT_ROOM_TYPES.GROUP;
  const currentUserId = useUserStore((state) => state.user?.id);
  const timeZone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const markRoomAsRead = useChatStore((state) => state.markRoomAsRead);
  const applyIncomingMessage = useChatStore((state) => state.applyIncomingMessage);

  // APIは created_at 降順で返るため、表示用に反転する
  const [messages, setMessages] = useState<ChatMessage[]>([...initialMessages].reverse());
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 古いメッセージを先頭に追加する直前にセットし、下のlayout effectで消費する。
  // ビューポートを先頭にジャンプさせず、同じメッセージ位置に留まらせるための復元用。
  const pendingScrollRestoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  // 最下部に張り付き続けるべきかどうか。マウント後も添付画像の読み込み完了等で
  // コンテンツの高さが変わり得るため、ResizeObserverでの追従にこのフラグを使う。
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
    // マウント時のみ実行（ルーム切替時は親コンポーネントごとremountされる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useLayoutEffect(() => {
    const restore = pendingScrollRestoreRef.current;
    const container = containerRef.current;
    if (!restore || !container) return;
    container.scrollTop = container.scrollHeight - restore.scrollHeight + restore.scrollTop;
    pendingScrollRestoreRef.current = null;
  }, [messages]);

  const loadMoreRef = useRef<() => void>(() => {});

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
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-50 shrink-0">
        <Link
          href="/chat"
          aria-label="チャット一覧に戻る"
          className="flex items-center justify-center w-10 h-10 -ml-1.5 rounded-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:scale-90 transition-all shrink-0"
        >
          <ChevronLeft size={22} />
        </Link>
        {isGroup ? (
          <>
            <div
              style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
              className="rounded-full bg-emerald-50 flex items-center justify-center shrink-0"
            >
              <UsersIcon size={16} className="text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-800 truncate">{room.room_name || 'グループ'}</p>
              <p className="text-[11px] text-slate-400 truncate">
                {members.map((m) => m.user_name || '不明なユーザー').join(' / ')}
              </p>
            </div>
          </>
        ) : (
          <>
            <MessageAvatar iconPath={otherMember?.icon_path} name={otherMember?.user_name} size={AVATAR_SIZE} />
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-800 truncate">{otherMember?.user_name || '不明なユーザー'}</p>
              {otherMember && (
                <p className="text-[11px] text-slate-400">{USER_TYPE_LABEL_JA[otherMember.user_type] ?? '不明'}</p>
              )}
            </div>
          </>
        )}
      </div>

      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-slate-50/50">
        <div ref={contentRef} className="max-w-160 mx-auto space-y-0.5">
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
                      <span className="text-xs font-bold text-slate-700">{sender?.user_name || '不明なユーザー'}</span>
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
                      className={`max-w-120 min-w-0 rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                        isMine ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'
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
        <div className="border-t border-slate-50 p-4 text-center text-xs font-bold text-slate-400">
          このルームの参加者ではないため、メッセージを送信できません。
        </div>
      )}
    </div>
  );
}
