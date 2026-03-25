import { create } from 'zustand';
import { getFavoritePhrases } from '@/actions/wordAction';
import { FavoritePhraseItem } from '@/types/word';

interface PhraseState {
  // --- Data States ---
  favoritePhrases: FavoritePhraseItem[] | null;
  isLoading: boolean;

  // --- Actions ---
  /**
   * お気に入りフレーズの取得
   */
  fetchFavorites: (force?: boolean) => Promise<void>;

  /**
   * フレーズの削除（楽観的UI更新用）
   */
  removeFavorite: (phraseId: string) => void;

  /**
   * キャッシュクリア
   */
  clearCache: () => void;
}

export const usePhraseStore = create<PhraseState>((set, get) => ({
  favoritePhrases: null,
  isLoading: false,

  fetchFavorites: async (force = false) => {
    if (!force && get().favoritePhrases) return;

    set({ isLoading: true });
    try {
      const res = await getFavoritePhrases();
      set({ favoritePhrases: res });
    } catch (error) {
      console.error("Failed to fetch favorite phrases:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  removeFavorite: (phraseId) => {
    set((state) => ({
      favoritePhrases: state.favoritePhrases 
        ? state.favoritePhrases.filter(p => p.phrase_id !== phraseId)
        : null
    }));
  },

  clearCache: () => set({ favoritePhrases: null }),
}));