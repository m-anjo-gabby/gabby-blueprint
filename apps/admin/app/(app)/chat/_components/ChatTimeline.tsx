'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useChatRealtimeMessages } from '@gabby/lib/chat/realtime/useChatRealtimeMessages';
import { getChatMessages } from '@gabby/lib/chat/actions/messageActions';
import { ChatMessage } from '@gabby/types/chat';
import { ChatMessageInput } from './ChatMessageInput';
import { ChatMessageContent } from './ChatMessageContent';

interface ChatTimelineProps {
  roomId: string;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export function ChatTimeline({ roomId, initialMessages, initialHasMore }: ChatTimelineProps) {
  const currentUserId = useUserStore((state) => state.user?.id);
  const markRoomAsRead = useChatStore((state) => state.markRoomAsRead);
  const applyIncomingMessage = useChatStore((state) => state.applyIncomingMessage);

  // APIは created_at 降順で返るため、表示用に昇順へ並び替える
  const [messages, setMessages] = useState<ChatMessage[]>([...initialMessages].reverse());
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const markLatestAsRead = (latest: ChatMessage) => {
    markRoomAsRead(roomId, latest.chat_id);
  };

  useEffect(() => {
    if (messages.length > 0) {
      markLatestAsRead(messages[messages.length - 1]);
    }
    bottomRef.current?.scrollIntoView({ block: 'end' });
    // 初回マウント時のみ実行（ルーム切り替え時は親コンポーネントごと再マウントされる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useChatRealtimeMessages(roomId, (message) => {
    setMessages((prev) => [...prev, message]);
    applyIncomingMessage(roomId, message.sender_user_id === currentUserId);
    if (message.sender_user_id !== currentUserId) {
      markLatestAsRead(message);
    }
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  });

  const handleLoadMore = async () => {
    if (messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      const oldest = messages[0];
      const res = await getChatMessages({ roomId, cursor: oldest.created_at });
      if (res.success) {
        setMessages((prev) => [...[...res.data].reverse(), ...prev]);
        setHasMore(res.hasMore);
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSent = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isLoadingMore && <Loader2 size={14} className="animate-spin" />}
              過去のメッセージを読み込む
            </button>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_user_id === currentUserId;
          return (
            <div key={msg.chat_id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                  isMine ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}
              >
                <ChatMessageContent message={msg} />
                <p className={`text-[10px] mt-1 ${isMine ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <ChatMessageInput roomId={roomId} onSent={handleSent} />
    </div>
  );
}
