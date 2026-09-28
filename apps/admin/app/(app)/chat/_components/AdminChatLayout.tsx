'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { getAllChatRoomsForAdmin } from '@gabby/lib/chat/actions/roomActions';
import { filterChatRoomsByClient, getChatRoomClientOptions } from '@gabby/lib/chat/roomDisplay';
import { ChatSplitLayout } from '@gabby/lib/components/chat/ChatSplitLayout';
import { ChatRoomListPane } from '@gabby/lib/components/chat/ChatRoomListPane';
import { cn } from '@gabby/lib/utils';
import { USER_TYPES } from '@gabby/types/user';
import type { ChatRoomListItem } from '@gabby/types/chat';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { CHAT_SPLIT_BREAKPOINT } from '@/constants/chat';
import { CreateChatRoomDialog } from './CreateChatRoomDialog';
import { useAdminChatLabels } from './useAdminChatLabels';

/** チャットの2ペイン（左: ルーム一覧 / 右: 選択中のルーム） */
export function AdminChatLayout({ children }: { children: React.ReactNode }) {
  const labels = useAdminChatLabels();
  return (
    <ChatSplitLayout
      labels={labels}
      breakpoint={CHAT_SPLIT_BREAKPOINT}
      list={<AdminChatRoomList />}
      className="rounded-2xl border border-line shadow-sm"
      // Adminは全ルームのメッセージをRealtimeで受信するため、一覧に無いルームの新着では再取得しない
      refetchOnUnknownRoom={false}
    >
      {children}
    </ChatSplitLayout>
  );
}

function AdminChatRoomList() {
  const t = useTranslations('chat.roomList');
  const tCommon = useTranslations('chat.common');
  const locale = useLocale();
  const myRooms = useChatStore((state) => state.rooms);
  const isLoadingMyRooms = useChatStore((state) => state.isLoading);
  const invalidateMyRooms = useChatStore((state) => state.invalidate);
  const isAdmin = useUserStore((state) => state.user?.app_metadata?.user_type === USER_TYPES.ADMIN);

  const [mode, setMode] = useState<'mine' | 'all'>('mine');
  // null: 未取得（読み込み中）
  const [allRooms, setAllRooms] = useState<ChatRoomListItem[] | null>(null);
  const [clientFilter, setClientFilter] = useState('');

  useEffect(() => {
    if (mode !== 'all') return;
    let cancelled = false;
    getAllChatRoomsForAdmin().then((res) => {
      if (!cancelled && res.success) setAllRooms(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const sourceRooms = useMemo(() => (mode === 'mine' ? myRooms : allRooms ?? []), [mode, myRooms, allRooms]);
  const isLoading = mode === 'mine' ? isLoadingMyRooms : allRooms === null;
  const clientOptions = useMemo(
    () => getChatRoomClientOptions(sourceRooms, t('unnamedGroupClient'), locale === 'en' ? 'en' : 'ja'),
    [sourceRooms, t, locale]
  );
  const rooms = useMemo(() => filterChatRoomsByClient(sourceRooms, clientFilter), [sourceRooms, clientFilter]);

  return (
    <ChatRoomListPane
      rooms={rooms}
      isLoading={isLoading}
      headerAction={<CreateChatRoomDialog onCreated={invalidateMyRooms} />}
      emptyHint={clientFilter ? t('noRoomsFiltered') : undefined}
      toolbar={
        <div className="space-y-2">
          {isAdmin && (
            <div className="grid grid-cols-2 rounded-lg border border-line bg-canvas p-0.5">
              {(['mine', 'all'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold transition-colors',
                    mode === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'
                  )}
                >
                  {value === 'all' && <ShieldCheck size={13} />}
                  {value === 'mine' ? t('myChatsTab') : t('allRoomsTab')}
                </button>
              ))}
            </div>
          )}
          <SearchableSelect
            options={[{ value: '', label: tCommon('allClientsOption') }, ...clientOptions]}
            value={clientFilter}
            onChange={setClientFilter}
            placeholder={t('clientFilterPlaceholder')}
            searchPlaceholder={tCommon('clientSearchPlaceholder')}
            className="w-full"
          />
        </div>
      }
    />
  );
}
