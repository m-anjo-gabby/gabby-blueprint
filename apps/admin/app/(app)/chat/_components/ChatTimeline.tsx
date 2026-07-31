'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useChatRealtimeMessages } from '@gabby/lib/chat/realtime/useChatRealtimeMessages';
import { getChatMessages, deleteChatMessage } from '@gabby/lib/chat/actions/messageActions';
import { ChatMessage } from '@gabby/types/chat';
import { USER_TYPES } from '@gabby/types/user';
import { ChatMessageInput } from './ChatMessageInput';
import { ChatMessageContent } from './ChatMessageContent';

interface ChatTimelineProps {
  roomId: string;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  /** ログインユーザーがこのルームの参加者かどうか（falseの場合はAdminの査閲のみ、送信不可） */
  isMember: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export function ChatTimeline({ roomId, initialMessages, initialHasMore, isMember }: ChatTimelineProps) {
  const currentUser = useUserStore((state) => state.user);
  const currentUserId = currentUser?.id;
  const isAdmin = currentUser?.app_metadata?.user_type === USER_TYPES.ADMIN;
  const markRoomAsRead = useChatStore((state) => state.markRoomAsRead);
  const applyIncomingMessage = useChatStore((state) => state.applyIncomingMessage);
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();

  // APIは created_at 降順で返るため、表示用に昇順へ並び替える
  const [messages, setMessages] = useState<ChatMessage[]>([...initialMessages].reverse());
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const markLatestAsRead = (latest: ChatMessage) => {
    if (!isMember) return;
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
    // 自分の送信メッセージは handleSent の楽観的追加と Realtime のエコーが両方届くため重複排除する
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
    setMessages((prev) => (prev.some((m) => m.chat_id === message.chat_id) ? prev : [...prev, message]));
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  };

  const handleDelete = async (chatId: string) => {
    const ok = await showConfirm(
      'メッセージの削除',
      'ポリシー違反等を理由にこのメッセージを削除します。この操作は元に戻せません。よろしいですか？',
      { variant: 'danger', isModal: true }
    );
    if (!ok) return;

    const res = await deleteChatMessage({ chatId });
    if (!res.success) {
      showToast(res.error || 'メッセージの削除に失敗しました', 'error');
      return;
    }

    setMessages((prev) =>
      prev.map((m) => (m.chat_id === chatId ? { ...m, deleted_at: new Date().toISOString(), message: '' } : m))
    );
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
          const canDelete = isAdmin && !msg.deleted_at;
          return (
            <div key={msg.chat_id} className={`group flex items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
              {canDelete && isMine && (
                <button
                  onClick={() => handleDelete(msg.chat_id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-rose-500 shrink-0 mb-1"
                  title="削除する"
                >
                  <Trash2 size={14} />
                </button>
              )}
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
              {canDelete && !isMine && (
                <button
                  onClick={() => handleDelete(msg.chat_id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-rose-500 shrink-0 mb-1"
                  title="削除する"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {isMember ? (
        <ChatMessageInput roomId={roomId} onSent={handleSent} />
      ) : (
        <div className="border-t border-slate-100 p-4 text-center text-xs font-bold text-slate-400">
          このルームの参加者ではないため、閲覧のみ可能です（発言はできません）
        </div>
      )}
    </div>
  );
}
