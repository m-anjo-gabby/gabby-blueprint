import { History, Sparkles } from 'lucide-react';
import { getTTSAssets } from '@/actions/adminTTSAction';
import { PageHeader } from '@/components/common/PageHeader';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import TTSAssetGenerator from './_components/TTSAssetGenerator';
import { TTSAssetTable } from './_components/TTSAssetTable';

/**
 * TTS Designer（汎用の音声を作り、作った音声を一覧で管理する）
 */
export default async function TTSDesignerPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { rows, totalCount } = await getTTSAssets(parseListParams(await searchParams));

  return (
    <div className="space-y-8 pb-16">
      <PageHeader title="TTS Voice Designer" description="Generate and manage general-purpose AI voice assets." />

      <section>
        <SectionTitle icon={<Sparkles size={16} className="text-brand-500" />}>Design New Audio</SectionTitle>
        <TTSAssetGenerator />
      </section>

      <section>
        <SectionTitle icon={<History size={16} className="text-slate-400" />}>Recent Assets</SectionTitle>
        <TTSAssetTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} />
      </section>

      <div className="border-t border-slate-200 pt-8">
        <p className="text-[11px] leading-relaxed text-slate-400">
          <strong className="text-slate-500">Pro Tip:</strong> All generated files are stored in the
          <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-brand">audio/designer/</code>
          folder. Deleting a record here will also permanently delete the physical MP3 file from storage.
        </p>
      </div>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2 px-1">
      {icon}
      <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{children}</h2>
    </div>
  );
}
