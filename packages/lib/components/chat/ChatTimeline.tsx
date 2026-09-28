'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ChevronLeft, Loader2, Trash2 } from 'lucide-react';
import { useUserStore } from '../../stores/useUserStore';
import { useChatStore } from '../../stores/useChatStore';
import { useTimezone } from '../../hooks/useTimezone';
import { useConfirm } from '../../hooks/useConfirm';
import { useToast } from '../../hooks/useToast';
import { useChatRealtimeMessages } from '../../chat/realtime/useChatRealtimeMessages';
import { useChatReadReceipt } from '../../chat/realtime/useChatReadReceipt';
import { deleteChatMessage, getChatMessageById, getChatMessages } from '../../chat/actions/messageActions';
import { formatMessageHeaderTime, isContinuationMessage } from '../../chat/messageGrouping';
import { getChatRoomCounterpart, getChatRoomTitle } from '../../chat/roomDisplay';
import { cn } from '../../utils';
import { CHAT_ROOM_TYPES, ChatMessage, ChatRoom, ChatRoomMemberSummary } from '@gabby/types/chat';
import { CHAT_SPLIT_CLASSES, getHeaderTimeLabels, useChatUi } from './ChatUiContext';
import { ChatAvatar } from './ChatAvatar';
import { ChatComposer } from './ChatComposer';
import { ChatMessageContent } from './ChatMessageContent';

interface ChatTimelineProps {
  roomId: string;
  room: ChatRoom;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  /** ログイン中のユーザーがこのルームの参加者かどうか（参加者でない場合はAdminの査閲のみ、送信不可） */
  isMember: boolean;
  members: ChatRoomMemberSummary[];
  /** メッセージの削除（モデレーション）を許可するか（Adminのみ） */
  allowModeration?: boolean;
  /** ヘッダー右端に置く操作（参加者管理・詳細パネルの開閉等） */
  headerActions?: React.ReactNode;
  /**
   * 1対1ルームの相手が最後に読んだメッセージの送信時刻（getChatRoomDetail の counterpartLastReadAt）。
   * 指定すると、相手が読んだ自分の最新の発言に「既読」を表示する。グループ・査閲では渡さない（null）
   */
  counterpartLastReadAt?: string | null;
}

const AVATAR_SIZE = 32;
const AVATAR_GAP = 10; // gap-2.5
const BUBBLE_PADDING_X = 16; // 吹き出しの px-4 分、見出しの開始位置を本文と揃える
// この距離（px）未満なら「下端に張り付いている」とみなす。添付画像の読み込み完了などで
// あとからコンテンツの高さが伸びるケースに追従して自動スクロールさせるためのしきい値。
const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

const isDocumentVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * チャットルームのタイムライン（2ペインの右側、またはモバイルのルーム画面）。
 * ルームの切り替え時は親ごと再マウントされる前提（[roomId] セグメント）。
 */
export function ChatTimeline({
  roomId,
  room,
  initialMessages,
  initialHasMore,
  isMember,
  members,
  allowModeration = false,
  headerActions,
  counterpartLastReadAt = null,
}: ChatTimelineProps) {
  const { labels, basePath, breakpoint } = useChatUi();
  const isGroup = room.room_type === CHAT_ROOM_TYPES.GROUP;
  const currentUserId = useUserStore((state) => state.user?.id);
  const timeZone = useTimezone();
  const timeLabels = getHeaderTimeLabels(labels, timeZone);
  const markRoomAsRead = useChatStore((state) => state.markRoomAsRead);
  const setActiveRoom = useChatStore((state) => state.setActiveRoom);
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();

  // APIは created_at 降順で返るため、表示用に昇順へ並び替える
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...initialMessages].reverse());
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // 開いた時点の未読の先頭（「ここから未読」の区切り線を出す位置）。一覧の未読数から求める
  const [firstUnreadChatId] = useState<string | null>(() => {
    const unread = useChatStore.getState().rooms.find((r) => r.room_id === roomId)?.unread_count ?? 0;
    if (unread <= 0 || initialMessages.length === 0) return null;
    // initialMessages は降順。未読が取得件数を超える場合は取得した最古のメッセージから未読とみなす
    return initialMessages[Math.min(unread, initialMessages.length) - 1].chat_id;
  });
  // 下端から離れて過去ログを読んでいる間に届いた新着の件数（「最新へ」ボタンに表示）
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  // メッセージがヘッダーの下に潜り込んでいる（一番上までスクロールしていない）間だけ、ヘッダーの区切り線を出す
  const [isScrolledFromTop, setIsScrolledFromTop] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  // 過去メッセージを先頭に追加する直前に退避し、下のlayout effectで復元する
  // （追加後も表示位置が飛ばず、LINE/Meetのように自然にスクロールが繋がる）
  const pendingScrollRestoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  // 最新メッセージに追従すべきかどうか。添付画像などは非同期に読み込まれ初回マウント後も
  // 高さが変化し続けるため、下のResizeObserverでの補正にこのフラグを使う
  const stickToBottomRef = useRef(true);
  const latestMessageRef = useRef<ChatMessage | undefined>(messages[messages.length - 1]);
  useEffect(() => {
    latestMessageRef.current = messages[messages.length - 1];
  }, [messages]);

  const memberByUserId = new Map(members.map((m) => [m.user_id, m]));
  const counterpart = getChatRoomCounterpart(members, currentUserId);
  const showReadReceipt = isMember && !isGroup;
  const [counterpartReadAt, setCounterpartReadAt] = useState<string | null>(counterpartLastReadAt);
  const title = getChatRoomTitle({ ...room, members, is_member: isMember }, currentUserId, labels);

  /** 表示中の最新メッセージまで既読にする（タブが裏にある間は既読にしない） */
  const markLatestAsRead = useCallback(() => {
    const latest = latestMessageRef.current;
    if (!isMember || !latest || !isDocumentVisible()) return;
    markRoomAsRead(roomId, latest.chat_id);
  }, [isMember, markRoomAsRead, roomId]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    stickToBottomRef.current = true;
    setIsAwayFromBottom(false);
    setNewWhileAway(0);
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior }));
  };

  // 表示中のルームを一覧側に伝える（表示中のルームへの新着は未読として数えない）
  useEffect(() => {
    setActiveRoom(roomId);
    return () => setActiveRoom(null);
  }, [roomId, setActiveRoom]);

  useEffect(() => {
    markLatestAsRead();
    // 未読がある場合は「ここから未読」の位置から読めるようにする。無ければ最新へ
    if (unreadDividerRef.current) {
      unreadDividerRef.current.scrollIntoView({ block: 'start' });
      const container = containerRef.current;
      if (container) {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        stickToBottomRef.current = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD_PX;
        setIsAwayFromBottom(!stickToBottomRef.current);
      }
    } else {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
    // 初回マウント時のみ実行（ルーム切り替え時は親コンポーネントごと再マウントされる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タブを裏から戻したときに、裏にいる間に届いたメッセージを既読にする
  useEffect(() => {
    const handleVisibility = () => {
      if (isDocumentVisible()) markLatestAsRead();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [markLatestAsRead]);

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
    const stuck = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD_PX;
    stickToBottomRef.current = stuck;
    setIsScrolledFromTop(container.scrollTop > 0);
    setIsAwayFromBottom(!stuck);
    if (stuck) setNewWhileAway(0);
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

  // 相手が既読にしたら「既読」の位置を進める（前にしか進めない）
  const advanceCounterpartRead = (readAt: string) =>
    setCounterpartReadAt((prev) => (prev && prev >= readAt ? prev : readAt));

  useChatReadReceipt(roomId, showReadReceipt ? counterpart?.user_id ?? null : null, (lastReadChatId) => {
    const known = messages.find((m) => m.chat_id === lastReadChatId);
    if (known) {
      advanceCounterpartRead(known.created_at);
      return;
    }
    getChatMessageById(lastReadChatId).then((res) => {
      if (res.success && res.data) advanceCounterpartRead(res.data.created_at);
    });
  });

  // 相手が読んだ自分の発言のうち最新の1件（その下に「既読」を出す）
  const lastReadOwnChatId = (() => {
    if (!showReadReceipt || !counterpartReadAt) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sender_user_id === currentUserId && !m.deleted_at && m.created_at <= counterpartReadAt) return m.chat_id;
    }
    return null;
  })();

  useChatRealtimeMessages(roomId, (message) => {
    // 自分の送信メッセージは handleSent の楽観的追加と Realtime のエコーが両方届くため重複排除する
    setMessages((prev) => (prev.some((m) => m.chat_id === message.chat_id) ? prev : [...prev, message]));
    if (message.sender_user_id === currentUserId) return;
    latestMessageRef.current = message;
    markLatestAsRead();
    // 過去ログを読んでいる最中は引き戻さず、「最新へ」ボタンに件数を出す
    if (stickToBottomRef.current) {
      scrollToBottom();
    } else {
      setNewWhileAway((n) => n + 1);
    }
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
    scrollToBottom();
  };

  const handleDelete = async (chatId: string) => {
    const ok = await showConfirm(labels.deleteMessageConfirmTitle, labels.deleteMessageConfirmBody, {
      variant: 'danger',
      isModal: true,
    });
    if (!ok) return;

    const res = await deleteChatMessage({ chatId });
    if (!res.success) {
      showToast(res.error || labels.deleteMessageFailed, 'error');
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.chat_id === chatId ? { ...m, deleted_at: new Date().toISOString(), message: '', attachments: [] } : m
      )
    );
  };

  const subtitle = !isMember
    ? members.map((m) => `${m.user_name || labels.unnamedUser}（${labels.userType[m.user_type]}）`).join(' / ')
    : isGroup
      ? members.map((m) => m.user_name || labels.unnamedUser).join(' / ')
      : counterpart
        ? labels.userType[counterpart.user_type]
        : '';

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface text-ink">
      <header
        className={cn(
          'flex shrink-0 items-center gap-3 border-b px-3 py-3 transition-colors sm:px-4',
          isScrolledFromTop ? 'border-line' : 'border-transparent'
        )}
      >
        <Link
          href={basePath}
          aria-label={labels.backToList}
          className={cn(
            '-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink',
            CHAT_SPLIT_CLASSES[breakpoint].backButton
          )}
        >
          <ChevronLeft size={22} />
        </Link>
        <ChatAvatar
          kind={!isMember ? 'review' : isGroup ? 'group' : 'user'}
          iconPath={counterpart?.icon_path}
          name={title}
          size={AVATAR_SIZE}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-bold text-ink">{title}</h2>
            {!isMember && (
              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600">
                {labels.reviewModeBadge}
              </span>
            )}
          </div>
          {subtitle && <p className="truncate text-[11px] text-ink-subtle">{subtitle}</p>}
        </div>
        {headerActions && <div className="flex shrink-0 items-center gap-1">{headerActions}</div>}
      </header>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
      >
        <div ref={contentRef} className="mx-auto max-w-200 space-y-0.5">
          <div ref={sentinelRef} />
          {isLoadingMore && (
            <div className="flex justify-center pb-2">
              <Loader2 size={14} className="animate-spin text-ink-subtle" />
            </div>
          )}

          {messages.map((msg, idx) => {
            const isMine = msg.sender_user_id === currentUserId;
            const isFirstUnread = msg.chat_id === firstUnreadChatId;
            const showHeader = isFirstUnread || !isContinuationMessage(msg, messages[idx - 1], timeZone);
            const sender = memberByUserId.get(msg.sender_user_id);
            const canDelete = allowModeration && !msg.deleted_at;
            const time = formatMessageHeaderTime(msg.created_at, timeLabels);
            const deleteButton = canDelete && (
              <button
                type="button"
                onClick={() => handleDelete(msg.chat_id)}
                className="mb-1 shrink-0 text-ink-subtle opacity-0 transition-opacity hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100"
                title={labels.deleteMessage}
                aria-label={labels.deleteMessage}
              >
                <Trash2 size={14} />
              </button>
            );

            return (
              <div key={msg.chat_id}>
                {isFirstUnread && (
                  <div ref={unreadDividerRef} className="flex scroll-mt-4 items-center gap-3 py-3" role="separator">
                    <span className="h-px flex-1 bg-brand-200" />
                    <span className="text-[11px] font-bold text-brand">{labels.unreadDivider}</span>
                    <span className="h-px flex-1 bg-brand-200" />
                  </div>
                )}
                <div className={cn('group flex flex-col', showHeader && 'pt-3', isMine ? 'items-end' : 'items-start')}>
                  {showHeader &&
                    (isMine ? (
                      <div className="mb-1">
                        <span className="text-[11px] text-ink-subtle">{time}</span>
                      </div>
                    ) : (
                      <div
                        className="mb-1 flex items-center gap-2"
                        style={{ paddingLeft: AVATAR_SIZE + AVATAR_GAP + BUBBLE_PADDING_X }}
                      >
                        <span className="text-xs font-bold text-ink-soft">{sender?.user_name || labels.unnamedUser}</span>
                        <span className="text-[11px] text-ink-subtle">{time}</span>
                      </div>
                    ))}
                  <div className={cn('flex min-w-0 max-w-full', !isMine && 'items-start gap-2.5')}>
                    {!isMine &&
                      (showHeader ? (
                        <ChatAvatar iconPath={sender?.icon_path} name={sender?.user_name} size={AVATAR_SIZE} />
                      ) : (
                        <div style={{ width: AVATAR_SIZE }} className="shrink-0" />
                      ))}
                    <div
                      className={cn(
                        'relative flex min-w-0 max-w-full items-end gap-1.5',
                        isMine ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {!showHeader && (
                        <span
                          className={cn(
                            'absolute bottom-1 whitespace-nowrap text-[11px] text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100',
                            isMine ? 'right-full mr-1.5' : 'left-full ml-1.5'
                          )}
                        >
                          {time}
                        </span>
                      )}
                      {isMine && deleteButton}
                      <div
                        className={cn(
                          'min-w-0 max-w-140 rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed',
                          // 自分=淡いブランド色、相手=淡いグレー。どちらも濃い文字にして長文でも読みやすくし、
                          // 濃いブランド色は送信ボタン等のアクセントに限定する（Google Chat と同じ考え方）
                          isMine ? 'rounded-br-sm bg-brand-100 text-ink' : 'rounded-bl-sm bg-ink/5 text-ink'
                        )}
                      >
                        <ChatMessageContent message={msg} />
                      </div>
                      {!isMine && deleteButton}
                    </div>
                  </div>
                  {msg.chat_id === lastReadOwnChatId && (
                    <span className="mt-1 text-[11px] text-ink-subtle">{labels.readReceipt}</span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {isAwayFromBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lg transition-colors hover:text-brand"
        >
          <ArrowDown size={14} />
          {newWhileAway > 0 ? labels.newMessages(newWhileAway) : labels.jumpToLatest}
        </button>
      )}

      {/* 入力エリアはタイムラインと同じ背景で一体に見せる。過去のメッセージを読んでいる間だけ境界線を出す */}
      <div className={cn('shrink-0 border-t transition-colors', isAwayFromBottom ? 'border-line' : 'border-transparent')}>
        {isMember ? (
          <ChatComposer roomId={roomId} onSent={handleSent} />
        ) : (
          <div className="p-4 text-center text-xs font-bold text-ink-subtle">{labels.viewOnlyNotice}</div>
        )}
      </div>
    </section>
  );
}
