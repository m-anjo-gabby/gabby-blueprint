import { redirect } from 'next/navigation';
import { getFavoritePhrases } from '@/actions/wordAction';
import { getFavoriteSprintQuestions } from '@/actions/sprintFavoriteAction';
import { createRenderId } from '@gabby/lib/navigation/renderId';
import { FavoritesView } from './_components/FavoritesView';
import type { FavoriteLists } from './_components/favoriteKinds';

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ kind?: string | string[] }> }) {
  // 教材のお気に入りは教材一覧の絞り込みに移したため、以前の種別指定のリンクはそちらへ送る
  if ((await searchParams).kind === 'contents') redirect('/library?favorite=1');

  const [phrases, sprintQuestions] = await Promise.all([
    getFavoritePhrases(),
    getFavoriteSprintQuestions(),
  ]);
  const lists: FavoriteLists = { phrases, sprintQuestions };

  return <FavoritesView initialLists={lists} renderId={createRenderId()} />;
}
