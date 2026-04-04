import { create } from 'zustand';
import { getLatestResumeContent, clearResumeContent } from '@/actions/contentAction';
import { ResumeContentResponse } from '@gabby/types/training';

interface ResumeState {
  resumeData: ResumeContentResponse | null; 
  isResumeLoading: boolean;
  lastFetched: number | null;
  
  // Actions
  fetchResume: (force?: boolean) => Promise<void>;
  clearResume: () => Promise<void>;
}

export const useResumeStore = create<ResumeState>((set, get) => ({
  resumeData: null,
  isResumeLoading: false,
  lastFetched: null,

  /**
   * 最新の再開情報を取得
   * @param force trueの場合、キャッシュを無視して強制リロード
   */
  fetchResume: async (force = false) => {
    const { resumeData, lastFetched } = get();
    // キャッシュ有効期限: 30分
    const isStale = !lastFetched || Date.now() - lastFetched > 1000 * 60 * 30;

    if (!force && resumeData && !isStale) return;

    set({ isResumeLoading: true });
    try {
      // サーバーアクションからデータを取得（型定義は非ジェネリックに変更済みを想定）
      const data = await getLatestResumeContent(); 
      
      set({ 
        resumeData: data as ResumeContentResponse, 
        lastFetched: Date.now() 
      });
    } catch (error) {
      console.error("Fetch Resume Error:", error);
      // エラー時はデータをクリアせず、古いデータを保持（UX維持）
    } finally {
      set({ isResumeLoading: false });
    }
  },

  /**
   * 栞情報を削除（DBおよびストア）
   */
  clearResume: async () => {
    try {
      await clearResumeContent();
      set({ resumeData: null, lastFetched: Date.now() });
    } catch (error) {
      console.error("Clear Resume Error:", error);
      throw error;
    }
  },
}));