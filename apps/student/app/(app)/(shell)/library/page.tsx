import { getAllContent } from '@/actions/contentAction';
import { createRenderId } from '@gabby/lib/navigation/renderId';
import { LibraryView } from './_components/LibraryView';

/**
 * 教材一覧。開くたびにサーバーで取得する（遷移直後は (shell)/loading.tsx の骨組みを表示）。
 * 画面をまたぐクライアントキャッシュは持たないため、管理側の教材更新・他画面でのお気に入り変更も次に開いた時に反映される。
 */
export default async function LibraryPage() {
  const contents = await getAllContent();
  return <LibraryView initialContents={contents} renderId={createRenderId()} />;
}
