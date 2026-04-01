import { create } from 'zustand';
import { getAllContent, toggleContentFavorite } from '@/actions/contentAction';
import { ContentItem } from '@/types/content';

interface ContentState {
  // --- Data States ---
  allContents: ContentItem[] | null; // ライブラリ用（全件）
  isLoading: boolean;

  // --- Actions ---
  /**
   * 教材データの取得。
   * @param force trueの場合、キャッシュを無視してAPIから再取得する
   */
  fetchAllContents: (force?: boolean) => Promise<void>;

  /**
   * お気に入り状態の楽観的アップデート。
   * サーバーのレスポンスを待たずにUIを更新し、不整合を防ぐ。
   */
  updateFavoriteStatus: (contentId: string, isFavorite: boolean) => void;

  /**
   * 特定の教材をお気に入りリストからのみ削除する場合（Favoriteタブ用）
   */
  removeFavorite: (contentId: string) => void;

  /**
   * ログアウト時などのキャッシュクリア
   */
  clearCache: () => void;
}

export const useContentStore = create<ContentState>((set, get) => ({
  allContents: null,
  isLoading: false,

  fetchAllContents: async (force = false) => {
    // キャッシュがあり、強制リフレッシュでない場合はスキップ
    if (!force && get().allContents) return;

    set({ isLoading: true });
    try {
      const res = await getAllContent();
      set({ allContents: res });
    } catch (error) {
      console.error("Failed to fetch contents:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  updateFavoriteStatus: (contentId, isFavorite) => {
    set((state) => ({
      allContents: state.allContents 
        ? state.allContents.map(c => 
            c.content_id === contentId ? { ...c, is_favorite: isFavorite } : c
          )
        : null
    }));
  },

  removeFavorite: (contentId) => {
    // updateFavoriteStatus(contentId, false) と同等の処理
    get().updateFavoriteStatus(contentId, false);
  },

  clearCache: () => set({ allContents: null }),
}));