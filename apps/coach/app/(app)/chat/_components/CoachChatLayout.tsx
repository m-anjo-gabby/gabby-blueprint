'use client';

import { useMemo, useState } from 'react';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { ChatSplitLayout } from '@gabby/lib/components/chat/ChatSplitLayout';
import { ChatRoomListPane } from '@gabby/lib/components/chat/ChatRoomListPane';
import { filterChatRoomsByClient, getChatRoomClientOptions } from '@gabby/lib/chat/roomDisplay';
import { CHAT_LABELS, CHAT_SPLIT_BREAKPOINT } from '@/constants/chat';

/** Chat 2-pane frame: room list on the left, the selected room (children) on the right */
export function CoachChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatSplitLayout
      labels={CHAT_LABELS}
      breakpoint={CHAT_SPLIT_BREAKPOINT}
      list={<CoachChatRoomList />}
      className="rounded-2xl border border-line shadow-sm"
    >
      {children}
    </ChatSplitLayout>
  );
}

function CoachChatRoomList() {
  const allRooms = useChatStore((state) => state.rooms);
  const isLoading = useChatStore((state) => state.isLoading);
  const [clientFilter, setClientFilter] = useState('');

  const clientOptions = useMemo(() => getChatRoomClientOptions(allRooms, 'Unnamed customer', 'en'), [allRooms]);
  const rooms = useMemo(() => filterChatRoomsByClient(allRooms, clientFilter), [allRooms, clientFilter]);

  return (
    <ChatRoomListPane
      rooms={rooms}
      isLoading={isLoading}
      toolbar={
        clientOptions.length > 1 && (
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            aria-label="Filter by customer"
            className="h-8 w-full rounded-md border border-line bg-surface px-2.5 text-xs text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100"
          >
            <option value="">All customers</option>
            {clientOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )
      }
    />
  );
}
