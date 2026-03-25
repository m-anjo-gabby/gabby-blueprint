// src/stores/useFavoriteStore.ts
import { create } from 'zustand';
import { getFavoriteContentes } from '@/actions/contentAction';
import { getFavoritePhrases } from '@/actions/wordAction';
import { FavoriteContentItem } from '@/types/content';
import { FavoritePhraseItem } from '@/types/word';

interface FavoriteStore {
  contents: FavoriteContentItem[] | null;
  phrases: FavoritePhraseItem[] | null;
  isLoadingContents: boolean;
  isLoadingPhrases: boolean;

  // データ取得（既存データがあればスキップ）
  fetchContents: (force?: boolean) => Promise<void>;
  fetchPhrases: (force?: boolean) => Promise<void>;

  // キャッシュ更新（削除・追加時に呼び出す）
  removeContent: (contentId: string) => void;
  removePhrase: (phraseId: string) => void;
  
  // ログアウト時などにクリア
  clearCache: () => void;
}

export const useFavoriteStore = create<FavoriteStore>((set, get) => ({
  contents: null,
  phrases: null,
  isLoadingContents: false,
  isLoadingPhrases: false,

  fetchContents: async (force = false) => {
    if (!force && get().contents) return; // キャッシュがあれば終了
    set({ isLoadingContents: true });
    try {
      const res = await getFavoriteContentes();
      set({ contents: res });
    } finally {
      set({ isLoadingContents: false });
    }
  },

  fetchPhrases: async (force = false) => {
    if (!force && get().phrases) return;
    set({ isLoadingPhrases: true });
    try {
      const res = await getFavoritePhrases();
      set({ phrases: res });
    } finally {
      set({ isLoadingPhrases: false });
    }
  },

  removeContent: (contentId) => {
    set((state) => ({
      contents: state.contents ? state.contents.filter(c => c.content_id !== contentId) : null
    }));
  },

  removePhrase: (phraseId) => {
    set((state) => ({
      phrases: state.phrases ? state.phrases.filter(p => p.phrase_id !== phraseId) : null
    }));
  },

  clearCache: () => set({ contents: null, phrases: null }),
}));