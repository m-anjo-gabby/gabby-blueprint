import { create } from 'zustand';

// 認可情報を含むメタデータの型定義
export type UserAppMetadata = {
  user_type?: string; // '0': admin, '1': student
  roles?: string[];    // ['system_admin', 'content_manager'] など
  client_id?: string;
};

export type User = {
  id: string;         // Supabase Auth の UUID
  user_id: number;    // com_m_user の BIGINT ID (表示・管理用)
  user_name: string;  // 表示名
  email: string | undefined;
  // 拡張: app_metadata の内容を保持
  app_metadata: UserAppMetadata;
} | null;

type UserState = {
  user: User;
  setUser: (user: User) => void;
  clearUser: () => void;
};

export const useUserStore = create<UserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}));