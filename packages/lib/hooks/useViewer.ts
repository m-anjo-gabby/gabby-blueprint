import { useContext } from 'react';
import { ViewerContext } from '../auth/ViewerProvider';
import { useUserStore, type User } from '../stores/useUserStore';

/**
 * ログイン中の利用者を返す（シェルの名前・アイコン等の表示用）。
 * プロフィールでの変更をすぐ反映するためストアの値を優先し、ストアが空のサーバーの描画・ハイドレーションでは
 * レイアウトがサーバーで取得した値（`ViewerProvider`）を使う。
 */
export function useViewer(): User {
  const storeUser = useUserStore((state) => state.user);
  const viewer = useContext(ViewerContext);
  return storeUser ?? viewer;
}
