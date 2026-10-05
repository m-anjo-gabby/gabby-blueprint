'use client';

import { CalendarPlus } from 'lucide-react';
import type { CalendarEventItem } from '@gabby/types/calendarEvent';
import { buildGoogleCalendarUrl, downloadIcsFile } from '@gabby/lib/calendarEvent/addToCalendar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface AddToCalendarMenuProps {
  event: CalendarEventItem;
  className?: string;
}

/**
 * イベントを自分のカレンダーに追加するメニュー（Google カレンダー / .ics ファイル）。
 * 参加URLは参加登録済みの場合だけ予定の説明欄に含める。
 */
export function AddToCalendarMenu({ event, className }: AddToCalendarMenuProps) {
  const locationUrl = event.is_joined ? event.location_url : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" icon={<CalendarPlus />} className={className}>
          カレンダーに追加
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild>
          <a href={buildGoogleCalendarUrl(event, { locationUrl })} target="_blank" rel="noopener noreferrer">
            Google カレンダー
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadIcsFile(event, { locationUrl })}>
          その他のカレンダー（.ics）
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
