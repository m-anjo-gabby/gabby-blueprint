'use client';

import { Film, FolderPlus, PlusCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useToast } from '@gabby/lib/hooks/useToast';
import { videoPairPositions } from '@gabby/lib/video/pairs';
import { VIDEO_STATUS, type AdminVideoItem, type AdminVideoSection, type VideoStatus } from '@gabby/types/video';
import {
  deleteVideo,
  deleteVideoSection,
  getVideoEditorSections,
  moveVideoInSection,
  moveVideoSection,
  setVideoStatus,
} from '@/actions/adminVideoAction';
import { LoadErrorSection } from '@/components/common/LoadErrorSection';
import { boldChunks, DeleteConfirmDialog } from '@/components/list/DeleteConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VideoFormDialog, type VideoFormTarget } from './VideoFormDialog';
import { VideoMoveDialog } from './VideoMoveDialog';
import { VideoPreviewDialog } from './VideoPreviewDialog';
import { VideoSectionCard } from './VideoSectionCard';
import { VideoSectionFormDialog, type VideoSectionFormTarget } from './VideoSectionFormDialog';

interface VideoEditorProps {
  contentId: string;
  /** ページでサーバー取得したセクションとビデオ（null は取得の失敗）。編集の後だけブラウザから取り直す */
  initialSections: AdminVideoSection[] | null;
}

type ActionOutcome = { success: true } | { success: false; message: string };

export function VideoEditor({ contentId, initialSections }: VideoEditorProps) {
  const t = useTranslations('contents.editor.video.index');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const [sections, setSections] = useState<AdminVideoSection[]>(initialSections ?? []);
  const [isLoadFailed, setIsLoadFailed] = useState(initialSections === null);
  /** 操作中のセクション・ビデオの ID（その行のボタンを止める） */
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sectionForm, setSectionForm] = useState<VideoSectionFormTarget | null>(null);
  const [videoForm, setVideoForm] = useState<VideoFormTarget | null>(null);
  const [moving, setMoving] = useState<AdminVideoItem | null>(null);
  const [previewing, setPreviewing] = useState<AdminVideoItem | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<AdminVideoItem | null>(null);
  const [deletingSection, setDeletingSection] = useState<AdminVideoSection | null>(null);

  const fetchSections = useCallback(async () => {
    const res = await getVideoEditorSections(contentId);
    if (res.success) {
      setSections(res.sections);
      setIsLoadFailed(false);
    } else {
      showToast(tCommon('errors.loadFailed'), 'error');
    }
  }, [contentId, showToast, tCommon]);

  /** 行の操作を実行し、成功したら取り直す */
  const run = async (id: string, action: () => Promise<ActionOutcome>, successMessage?: string) => {
    setBusyId(id);
    try {
      const res = await action();
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      if (successMessage) showToast(successMessage, 'success');
      await fetchSections();
    } finally {
      setBusyId(null);
    }
  };

  const videoCount = sections.reduce((sum, s) => sum + s.videos.length, 0);
  const lastSectionId = sections.at(-1)?.section_id;
  // 今日のトレーニングメニューと同じく、生徒に見える（公開中の）ビデオの並びで組を決める
  const pairPositions = videoPairPositions(
    sections.flatMap((s) => s.videos).filter((v) => v.status === VIDEO_STATUS.PUBLISHED),
  );

  return (
    <div className="flex flex-col h-full bg-slate-50/30 overflow-hidden">
      <div className="shrink-0 p-4 px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-4 sticky top-0 z-20 shadow-sm">
        <Badge variant="outline" className="bg-brand-50 text-brand border-brand-100 font-black">
          {t('summary', { sections: sections.length, videos: videoCount })}
        </Badge>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl font-bold"
            icon={<FolderPlus size={18} />}
            onClick={() => setSectionForm({ mode: 'create' })}
          >
            {t('addSection')}
          </Button>
          <Button
            className="bg-brand hover:bg-brand-strong text-white font-bold h-10 rounded-xl shadow-md"
            icon={<PlusCircle size={18} />}
            disabled={!lastSectionId}
            onClick={() => lastSectionId && setVideoForm({ mode: 'create', sectionId: lastSectionId })}
          >
            {t('addVideo')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {isLoadFailed ? (
          <LoadErrorSection className="m-6" />
        ) : (
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6 max-w-5xl mx-auto pb-32">
              {sections.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-slate-200 rounded-[40px] bg-white/50 text-slate-400 gap-4">
                  <div className="p-4 bg-white rounded-full shadow-sm">
                    <Film size={32} className="text-slate-200" />
                  </div>
                  <p className="text-sm font-bold">{t('emptyState')}</p>
                </div>
              ) : (
                sections.map((section, index) => (
                  <VideoSectionCard
                    key={section.section_id}
                    section={section}
                    isFirst={index === 0}
                    isLast={index === sections.length - 1}
                    busyId={busyId}
                    pairPositions={pairPositions}
                    onMoveSection={(direction) =>
                      run(section.section_id, () => moveVideoSection(section.section_id, direction))
                    }
                    onRenameSection={() => setSectionForm({ mode: 'edit', section })}
                    onDeleteSection={() => setDeletingSection(section)}
                    onAddVideo={() => setVideoForm({ mode: 'create', sectionId: section.section_id })}
                    onEditVideo={(video) => setVideoForm({ mode: 'edit', video })}
                    onPreviewVideo={setPreviewing}
                    onMoveVideoToSection={setMoving}
                    onDeleteVideo={setDeletingVideo}
                    onMoveVideo={(video, direction) =>
                      run(video.video_id, () => moveVideoInSection(video.video_id, direction))
                    }
                    onChangeStatus={(video, status: VideoStatus) =>
                      run(video.video_id, () => setVideoStatus(video.video_id, status), t('statusChanged'))
                    }
                  />
                ))
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      <VideoSectionFormDialog
        contentId={contentId}
        target={sectionForm}
        onClose={() => setSectionForm(null)}
        onSaved={fetchSections}
      />
      <VideoFormDialog
        target={videoForm}
        sections={sections}
        onClose={() => setVideoForm(null)}
        onSaved={fetchSections}
      />
      <VideoMoveDialog video={moving} onClose={() => setMoving(null)} onMoved={fetchSections} />
      <VideoPreviewDialog video={previewing} onClose={() => setPreviewing(null)} />

      <DeleteConfirmDialog
        target={deletingVideo}
        onClose={() => setDeletingVideo(null)}
        onConfirm={(video) => {
          setDeletingVideo(null);
          void run(video.video_id, () => deleteVideo(video.video_id), t('videoDeleted'));
        }}
        title={t('deleteVideoTitle')}
        description={(video) => t.rich('deleteVideoDescription', { title: video.title, b: boldChunks })}
        confirmLabel={t('deleteConfirm')}
      />
      <DeleteConfirmDialog
        target={deletingSection}
        onClose={() => setDeletingSection(null)}
        onConfirm={(section) => {
          setDeletingSection(null);
          void run(section.section_id, () => deleteVideoSection(section.section_id), t('sectionDeleted'));
        }}
        title={t('deleteSectionTitle')}
        description={(section) =>
          t.rich('deleteSectionDescription', { name: section.section_name ?? t('untitledSection'), b: boldChunks })
        }
        confirmLabel={t('deleteConfirm')}
      />
    </div>
  );
}
