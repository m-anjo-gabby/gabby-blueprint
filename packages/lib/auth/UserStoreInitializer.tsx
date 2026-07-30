'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '../supabase/client';
import { UserAppMetadata, useUserStore } from '../stores/useUserStore';

/**
 * UserStoreInitializer の Props
 * サーバーサイド（layout.tsx等）で取得した最小限の認証情報を渡します。
 */
export interface UserStoreInitializerProps {
  user: {
    id: string;
    email?: string;
    app_metadata?: any;
  };
}

/**
 * ユーザー情報の初期化および認証状態の監視を行うコンポーネント
 * * 役割:
 * 1. サーバーから渡された Auth 情報を Zustand ストアに即座に反映（ハイドレーション）
 * 2. クライアントサイドで DB (com_m_user) から詳細なプロフィールを取得して補完
 * 3. 認証状態の変化（ログアウト等）をリッスンし、ストアの状態を自動同期
 */
export default function UserStoreInitializer({ user }: UserStoreInitializerProps) {
  // 共通ストアから更新関数を取得
  const setUser = useUserStore((state) => state.setUser);
  const supabase = createBrowserClient();
  
  // React.StrictMode 等による二重実行を防ぎ、初回マウント時のみ処理するためのフラグ
  const initialized = useRef(false);

  useEffect(() => {
    const initializeUser = async () => {
      // --- Step 1: 即時反映 ---
      // 画面のチラつきを防ぐため、まずはサーバーから届いている情報をストアにセットします。
      setUser({
        id: user.id,
        user_id: 0,           // 詳細取得までの仮値
        user_name: '...',    // ローディング表示用
        email: user.email,
        locale_id: 'ja',      // DBデフォルト値
        timezone: 'Asia/Tokyo', // DBデフォルト値
        app_metadata: (user.app_metadata as UserAppMetadata) || { user_type: '1', roles: [] },
      });

      // --- Step 2: プロフィール情報の補完 ---
      // Supabase DB からニックネーム等の詳細情報を取得します。
      const { data: profile, error } = await supabase
        .from('com_m_user')
        .select('user_id, user_name, locale_id, timezone')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('[UserStore] Failed to fetch profile:', error.message);
        // DB取得に失敗した場合は、仮値 '...' のまま残留しないようメールアドレスにフォールバック
        setUser({
          id: user.id,
          user_id: 0,
          user_name: user.email?.split('@')[0] ?? '',
          email: user.email,
          locale_id: 'ja',
          timezone: 'Asia/Tokyo',
          app_metadata: (user.app_metadata as UserAppMetadata) || { user_type: '1', roles: [] },
        });
      }

      if (profile) {
        setUser({
          id: user.id,
          user_id: profile.user_id,
          user_name: profile.user_name ?? '',
          email: user.email,
          locale_id: profile.locale_id,
          timezone: profile.timezone,
          app_metadata: (user.app_metadata as UserAppMetadata) || { user_type: '1', roles: [] },
        });
      }
    };

    // マウント時の初回実行
    if (!initialized.current) {
      initializeUser();
      initialized.current = true;
    }

    // --- Step 3: 認証イベントの監視 ---
    // 別タブでのログアウトやセッション切れを検知し、ストアをクリアします。
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // 'INITIAL_SESSION' 等、SIGNED_OUT以外のイベントでの session 一時null化により
      // 取得済みのユーザー情報（user_name等）が誤って消去されるのを防ぐため、
      // 明示的なサインアウトのみをクリア条件とする。
      if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    // クリーンアップ処理
    return () => {
      subscription.unsubscribe();
    };
  }, [user.id, user.email, setUser, supabase]);

  // このコンポーネントはロジック専用のため、何もレンダリングしません。
  return null;
}