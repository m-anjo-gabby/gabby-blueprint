'use client';

import { createContext, useEffect, useMemo, type ReactNode } from 'react';
import { useUserStore, type User, type UserAppMetadata } from '../stores/useUserStore';
import { createBrowserClient } from '../supabase/client';
import { type ViewerProfile } from './viewerProfile';

/**
 * ログイン中の利用者（レイアウトでサーバー取得した値）。
 * ストア（`useUserStore`）はサーバーの描画では空のため、サーバーの描画とハイドレーションの時点の値をここから渡す。
 * 読むときは `useViewer` / `useTimezone`（`packages/lib/hooks/`）を使う。
 */
export const ViewerContext = createContext<User>(null);

export interface ViewerProviderProps {
  user: {
    id: string;
    email?: string;
    /** JWT の app_metadata（DB のフックが user_type・roles を入れる） */
    app_metadata?: unknown;
  };
  /** `loadViewerProfile` でサーバー取得したプロフィール */
  profile: ViewerProfile;
  children: ReactNode;
}

/**
 * ログイン中の利用者を配下へ渡し、ストアへ反映して認証状態を監視する（各アプリの `(app)/layout.tsx` に置く）。
 * ブラウザでプロフィールを取り直すと、取得までの間だけ仮の名前・日本時間で描かれて表示が切り替わるため、
 * サーバーで取得した値をそのまま使う。
 */
export function ViewerProvider({ user, profile, children }: ViewerProviderProps) {
  const setUser = useUserStore((state) => state.setUser);
  const viewer = useMemo<User>(
    () => ({
      id: user.id,
      user_id: profile.user_id,
      user_name: profile.user_name,
      icon_path: profile.icon_path,
      email: user.email,
      locale_id: profile.locale_id,
      timezone: profile.timezone,
      app_metadata: (user.app_metadata as UserAppMetadata) || { user_type: '1', roles: [] },
    }),
    [user.id, user.email, user.app_metadata, profile],
  );

  useEffect(() => {
    setUser(viewer);
  }, [viewer, setUser]);

  useEffect(() => {
    // 別タブでのログアウトやセッション切れを検知し、ストアをクリアします。
    // 'INITIAL_SESSION' 等、SIGNED_OUT以外のイベントでの session 一時null化により
    // 取得済みのユーザー情報（user_name等）が誤って消去されるのを防ぐため、
    // 明示的なサインアウトのみをクリア条件とする。
    const {
      data: { subscription },
    } = createBrowserClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [setUser]);

  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}
