'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HistoryListProps<T> {
  initialItems: T[];
  initialCursor: string | null;
  pageSize: number;
  fetchPage: (cursor: string | null, limit: number) => Promise<{ items: T[]; nextCursor: string | null }>;
  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  emptyLabel: string;
}

/**
 * insert_dateカーソルでページング取得する履歴一覧の共通UI。matching/booking/reschedule_proposal
 * の3タブ全てで同じ「初期表示分はサーバーから、以降はボタン押下でサーバーへ再取得」の
 * 挙動を共有する（コーチの稼働年数が伸びても初期ロード・各追加ロードのサイズは一定に保たれる）。
 */
export function HistoryList<T>({ initialItems, initialCursor, pageSize, fetchPage, getKey, renderItem, emptyLabel }: HistoryListProps<T>) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [isLoading, setIsLoading] = useState(false);

  const handleShowMore = async () => {
    setIsLoading(true);
    try {
      const page = await fetchPage(cursor, pageSize);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setIsLoading(false);
    }
  };

  if (items.length === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={getKey(item)}>{renderItem(item)}</div>
      ))}
      {cursor && (
        <Button type="button" variant="outline" className="w-full" onClick={handleShowMore} disabled={isLoading}>
          {isLoading && <Loader2 size={14} className="animate-spin" />}
          Show more
        </Button>
      )}
    </div>
  );
}
