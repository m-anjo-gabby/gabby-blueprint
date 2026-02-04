'use client';

import { useEffect, useRef } from 'react';
import { useUserStore } from '@/stores/userStore';
import { createClient } from '@/lib/client';

// Props の型定義を追加
export interface UserStoreInitializerProps {
  user: {
    id: string;
    email: string | undefined;
  };
}

export default function UserStoreInitializer({ user }: UserStoreInitializerProps) {
  const setUser = useUserStore((state) => state.setUser);
  const supabase = createClient();
  
  // 初回レンダリング時のみ実行するためのフラグ
  const initialized = useRef(false);

  useEffect(() => {
    const initializeUser = async () => {
      // 1. まずサーバーから渡された基本情報を即座にセット（表示のチラつき防止）
      setUser({
        id: user.id,
        user_id: 0,
        user_name: 'user_name',
        email: user.email,
      });

      // 2. DBから詳細情報（nickname等）を取得して補完
      const { data: profile } = await supabase
        .from('com_m_user')
        .select('user_id, user_name')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUser({
          id: user.id,
          user_id: profile.user_id,
          user_name: profile.user_name,
          email: user.email,
        });
      }
    };

    if (!initialized.current) {
      initializeUser();
      initialized.current = true;
    }

    // ログアウトなどの状態変化を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) setUser(null);
    });

    return () => subscription.unsubscribe();
  }, [user.id, user.email, setUser, supabase]);

  return null;
}