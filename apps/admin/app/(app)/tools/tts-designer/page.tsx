import { Suspense } from 'react';
import { createAdminClient } from '@/lib/admin';
import { Speech, History, Sparkles } from 'lucide-react';
import TTSAssetGenerator from './_components/TTSAssetGenerator';
import TTSAssetTable from './_components/TTSAssetTable';

// 常に最新のDB状態を反映させるため、キャッシュを無効化
export const revalidate = 0;

/**
 * TTS Designer メインページ
 * 既存の AdminLayout (Sidebar + Scrollable Main) の中身としてレンダリングされます。
 */
export default async function TTSDesignerPage() {
  const supabase = createAdminClient();

  // 汎用TTS資産（履歴）を降順で取得
  const { data: assets, error } = await supabase
    .from('com_t_tts_asset')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[TTS Designer] Fetch Error:', error);
  }

  return (
    /* 外枠に固定高(h-screen)を持たせないのがコツです。
       AdminLayoutのmain(overflow-y-auto)がスクロールを管理します。
    */
    <div className="space-y-10 pb-16">
      
      {/* --- Page Header --- */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20 text-white">
            <Speech size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              TTS Voice Designer
            </h1>
            <p className="text-sm font-medium text-slate-500">
              Generate and manage general-purpose AI voice assets.
            </p>
          </div>
        </div>
      </header>

      {/* --- Generator Section (Input & Controls) --- */}
      <section className="relative group">
        <div className="flex items-center gap-2 mb-4 px-1">
          <Sparkles size={16} className="text-indigo-500" />
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
            Design New Audio
          </h2>
        </div>
        {/* 新規作成コンポーネント */}
        <TTSAssetGenerator />
      </section>

      {/* --- History Section (Table View) --- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <History size={16} className="text-slate-400" />
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
              Recent Assets
            </h2>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-500 rounded-full uppercase tracking-wider">
            {assets?.length || 0} items
          </span>
        </div>

        {/* データ取得中のフォールバック。
           Suspenseを使うことで、テーブルの描画を待たずにページを表示できます。
        */}
        <Suspense fallback={
          <div className="w-full h-48 bg-slate-100 animate-pulse rounded-2xl border border-slate-200 flex items-center justify-center text-slate-400 text-sm font-medium">
            Loading assets...
          </div>
        }>
          <TTSAssetTable assets={assets || []} />
        </Suspense>
      </section>

      {/* --- Usage Tip (Footer) --- */}
      <div className="pt-8 border-t border-slate-200">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          <strong className="text-slate-500">Pro Tip:</strong> All generated files are stored in the 
          <code className="mx-1 px-1.5 py-0.5 bg-slate-100 text-indigo-600 rounded">audio/designer/</code> 
          folder. Deleting a record here will also permanently delete the physical MP3 file from storage.
        </p>
      </div>
    </div>
  );
}