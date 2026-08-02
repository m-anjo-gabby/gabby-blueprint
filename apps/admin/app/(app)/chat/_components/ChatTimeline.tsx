'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, ShieldCheck, Trash2, User as UserIcon } from 'lucide-react';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useChatRealtimeMessages } from '@gabby/lib/chat/realtime/useChatRealtimeMessages';
import { getChatMessages, deleteChatMessage } from '@gabby/lib/chat/actions/messageActions';
import { isContinuationMessage, formatMessageHeaderTime } from '@gabby/lib/chat/messageGrouping';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { ChatMessage, ChatRoomListItem } from '@gabby/types/chat';
import { getUserTypeLabel, USER_TYPES } from '@gabby/types/user';
import { ChatMessageInput } from './ChatMessageInput';
import { ChatMessageContent } from './ChatMessageContent';

interface ChatTimelineProps {
  roomId: string;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  /** ログインユーザーがこのルームの参加者かどうか（falseの場合はAdminの査閲のみ、送信不可） */
  isMember: boolean;
  members: ChatRoomListItem['members'];
}

const AVATAR_SIZE = 32;
const AVATAR_GAP = 10; // gap-2.5
const BUBBLE_PADDING_X = 16; // 吹き出しの px-4 分、本文の開始位置に揃える
// この距離（px）以内なら「下端に張り付いている」とみなし、後からのコンテンツ増加
// （添付画像の非同期ロード完了など）でも下端へ再追従させる
const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

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

export function ChatTimeline({ roomId, initialMessages, initialHasMore, isMember, members }: ChatTimelineProps) {
  const currentUser = useUserStore((state) => state.user);
  const currentUserId = currentUser?.id;
  const isAdmin = currentUser?.app_metadata?.user_type === USER_TYPES.ADMIN;
  const timeZone = currentUser?.timezone || 'Asia/Tokyo';
  const markRoomAsRead = useChatStore((state) => state.markRoomAsRead);
  const applyIncomingMessage = useChatStore((state) => state.applyIncomingMessage);
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();

  // APIは created_at 降順で返るため、表示用に昇順へ並び替える
  const [messages, setMessages] = useState<ChatMessage[]>([...initialMessages].reverse());
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 過去メッセージを先頭に追加する直前に退避し、下のlayout effectで復元する
  // （追加後も表示位置が飛ばずLINE/Meetのように自然にスクロールが繋がる）
  const pendingScrollRestoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  // 最新メッセージに追従すべきかどうか。添付画像などは非同期に読み込まれ初回マウント後も
  // 高さが変化し続けるため、単発の scrollIntoView だけでは下端まで届かないことがある
  // （下のResizeObserverで補正する）
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
    // 初回マウント時のみ実行（ルーム切り替え時は親コンポーネントごと再マウントされる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // コンテンツが増え続ける間（添付画像の解決・読み込みは初回マウント後に完了するため）下端へ
  // 追従させる。stickToBottomRef が true の間だけ動作するため、過去ログを読んでいる
  // ユーザーのスクロールを妨げることはない
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

  // 過去メッセージ追加後にスクロール位置を復元し、コンテンツが上に増えても表示が飛ばないようにする
  useLayoutEffect(() => {
    const restore = pendingScrollRestoreRef.current;
    const container = containerRef.current;
    if (!restore || !container) return;
    container.scrollTop = container.scrollHeight - restore.scrollHeight + restore.scrollTop;
    pendingScrollRestoreRef.current = null;
  }, [messages]);

  const loadMoreRef = useRef<() => void>(() => {});

  // タイムライン上部までスクロールした際に過去メッセージを自動取得する（LINE/Meetのような無限スクロール）
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
      prev.map((m) =>
        m.chat_id === chatId ? { ...m, deleted_at: new Date().toISOString(), message: '', attachments: [] } : m
      )
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-3 border-b border-slate-100 shrink-0">
        <Link
          href="/chat"
          aria-label="チャット一覧へ戻る"
          className="flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
        >
          <ChevronLeft size={24} />
        </Link>

        {isMember ? (
          <>
            <MessageAvatar iconPath={otherMember?.icon_path} name={otherMember?.user_name} size={AVATAR_SIZE} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">
                {otherMember?.user_name || '（名称未設定）'}
              </p>
              {otherMember && (
                <p className="text-[11px] text-slate-400">{getUserTypeLabel(otherMember.user_type)}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
              className="rounded-full bg-amber-50 flex items-center justify-center shrink-0"
            >
              <ShieldCheck size={16} className="text-amber-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-800 truncate">
                  {members.map((m) => m.user_name || '（名称未設定）').join(' ⇔ ')}
                </p>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">
                  査閲モード
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {members.map((m) => `${m.user_name || '（名称未設定）'}（${getUserTypeLabel(m.user_type)}）`).join(' / ')}
              </p>
            </div>
          </>
        )}
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
            const canDelete = isAdmin && !msg.deleted_at;
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
                      <span className="text-xs font-bold text-slate-700">{sender?.user_name || '（名称未設定）'}</span>
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
                    className={`relative flex min-w-0 max-w-full items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}
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
                      className={`max-w-160 min-w-0 rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                        isMine ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                      }`}
                    >
                      <ChatMessageContent message={msg} />
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
          このルームの参加者ではないため、閲覧のみ可能です（発言はできません）
        </div>
      )}
    </div>
  );
}
