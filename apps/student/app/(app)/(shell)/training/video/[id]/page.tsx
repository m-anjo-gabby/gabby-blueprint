import { notFound } from 'next/navigation';
import { SectionLoadError } from '@gabby/lib/components/common/SectionLoadError';
import { pickInitialVideoId } from '@gabby/lib/video/progress';
import { getStudentVideoContent } from '@/actions/videoAction';
import { LOAD_ERROR_MESSAGE, RELOAD_LABEL } from '@/constants/network';
import { VideoPageHeader } from '../_components/VideoContentSkeleton';
import { VideoContentView } from '../_components/VideoContentView';

interface VideoContentPageProps {
  params: Promise<{ id: string }>;
  /** v: 開くビデオ。resume / resume_id: ホームの「続きから」（getResumePath）から来た時 */
  searchParams: Promise<{ v?: string; resume?: string; resume_id?: string }>;
}

/**
 * ビデオ教材（シリーズ）の画面。開くたびにサーバーで取得し、再生用の URL もここで作る。
 * 見えない教材（非公開・公開範囲の外・ビデオ以外）は 404
 */
export default async function VideoContentPage({ params, searchParams }: VideoContentPageProps) {
  const { id } = await params;
  const { v, resume, resume_id: resumeId } = await searchParams;

  const res = await getStudentVideoContent(id);
  if (!res.success) {
    return (
      <>
        <VideoPageHeader />
        <SectionLoadError message={LOAD_ERROR_MESSAGE} retryLabel={RELOAD_LABEL} />
      </>
    );
  }
  if (!res.data) notFound();

  const isResume = resume === 'true';
  return (
    <VideoContentView
      content={res.data}
      initialVideoId={pickInitialVideoId(res.data.sections, (isResume ? resumeId : v) ?? null)}
      consumeBookmark={isResume}
    />
  );
}
