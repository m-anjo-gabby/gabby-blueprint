'use client';

import { useRouter } from 'next/navigation';
import type { FavoriteContentItem } from '@gabby/types/content';
import { getTrainingPath } from '@gabby/lib/navigation/student-path';
import { ContentCard } from '@/components/common/ContentCard';

interface ContentFavoriteCardProps {
  content: FavoriteContentItem;
  onRemove: () => void;
}

/** お気に入り教材のカード（教材一覧と同じカードを、☆の代わりに削除ボタン付きで表示する） */
export function ContentFavoriteCard({ content, onRemove }: ContentFavoriteCardProps) {
  const router = useRouter();

  return (
    <ContentCard
      content={content}
      actionMode="favorite"
      onToggleFavorite={onRemove}
      onStart={(c) => router.push(getTrainingPath(c))}
    />
  );
}
