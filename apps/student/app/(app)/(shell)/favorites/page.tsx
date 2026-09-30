import { getFavoriteContents } from '@/actions/contentAction';
import { getFavoritePhrases } from '@/actions/wordAction';
import { getFavoriteSprintQuestions } from '@/actions/sprintFavoriteAction';
import { FavoritesView } from './_components/FavoritesView';
import type { FavoriteLists } from './_components/favoriteKinds';

export default async function FavoritesPage() {
  const [contents, phrases, sprintQuestions] = await Promise.all([
    getFavoriteContents(),
    getFavoritePhrases(),
    getFavoriteSprintQuestions(),
  ]);
  const lists: FavoriteLists = { contents, phrases, sprintQuestions };

  return <FavoritesView initialLists={lists} />;
}
