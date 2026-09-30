import { getFavoriteContents } from '@/actions/contentAction';
import { getFavoritePhrases } from '@/actions/wordAction';
import { FavoritesView } from './_components/FavoritesView';
import type { FavoriteLists } from './_components/favoriteKinds';

export default async function FavoritesPage() {
  const [contents, phrases] = await Promise.all([getFavoriteContents(), getFavoritePhrases()]);
  const lists: FavoriteLists = { contents, phrases };

  return <FavoritesView initialLists={lists} />;
}
