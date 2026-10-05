'use client';

import type { CalendarEventItem } from '@gabby/types/calendarEvent';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { CalendarEventCard } from './CalendarEventCard';
import { formatEventSlot } from './EventMeta';

interface EventDetailDrawerProps {
  /** 表示中のイベント（null で閉じる） */
  event: CalendarEventItem | null;
  timezone: string;
  onClose: () => void;
  onParticipationChanged: (calendarEventId: string, isJoined: boolean) => void;
  /** 「このシリーズの回をすべて見る」を出すか（グループセッションの一覧の中では出さない） */
  showSeriesLink?: boolean;
}

/**
 * イベントの詳細をボトムシートで開く（ホームのカード・グループセッションの一覧から使う）。
 * 中身はカレンダーの日の詳細と同じ CalendarEventCard（説明・アナウンス・参加登録/取消・カレンダーに追加）。
 */
export function EventDetailDrawer({ event, timezone, onClose, onParticipationChanged, showSeriesLink }: EventDetailDrawerProps) {
  return (
    <Drawer open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-h-[85vh] max-w-2xl">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-base font-bold text-ink">{event ? formatEventSlot(event, timezone).date : ''}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">
          {event && (
            <CalendarEventCard
              event={event}
              timezone={timezone}
              onParticipationChanged={onParticipationChanged}
              showSeriesLink={showSeriesLink}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
