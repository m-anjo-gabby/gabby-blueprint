import { create } from 'zustand';

// com_m_user の情報を含むように拡張
export type User = {
  id: string;        // Supabase Auth の UUID
  user_id: number;    // com_m_user の BIGINT ID
  user_name: string;  // 表示名
  email: string | undefined;
  role?: string;
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