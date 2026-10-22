'use server';

import { unstable_rethrow } from 'next/navigation';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { createServerClient } from '@gabby/lib/supabase/server';
import { formatVideoDuration } from '@gabby/lib/video/format';
import { getVideoFileUrls } from '@gabby/lib/video/storage';
import type { ActionResult, BasicErrorCode, CoreResult } from '@gabby/types/action';
import { CONTENT_STATUS } from '@gabby/types/content';
import type { VideoResumeMetadata } from '@gabby/types/training';
import type { StudentVideoContent, StudentVideoItem, StudentVideoProgress } from '@gabby/types/video';
import { saveResumeContent } from './contentAction';

const logger = createLogger('student');

/** ビデオ教材の content_type（com_m_contents） */
const VIDEO_CONTENT_TYPE = 1;

const byOrder = (a: { seq_no: number; insert_date: string }, b: { seq_no: number; insert_date: string }) =>
  a.seq_no - b.seq_no || a.insert_date.localeCompare(b.insert_date);

/**
 * ビデオ教材の画面のデータ（公開中のビデオだけ。見えない教材は data が null）。
 * 教材・区切り・ビデオは本人の権限（RLS）で読み、見えた行のファイルにだけ署名付き URL を作る（docs/SECURITY.md 4章）
 */
export async function getStudentVideoContent(
  contentId: string,
): Promise<CoreResult<{ data: StudentVideoContent | null }, BasicErrorCode>> {
  const ctx = await getLogContext();
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };
    const supabase = await createServerClient();

    const { data: content, error } = await supabase
      .from('com_m_contents')
      .select(
        'content_id, content_name, description, com_m_video_section(section_id, section_name, seq_no, insert_date, com_m_video(video_id, title, description, duration_sec, video_path, thumbnail_path, seq_no, insert_date))',
      )
      .eq('content_id', contentId)
      .eq('content_type', VIDEO_CONTENT_TYPE)
      .eq('status', CONTENT_STATUS.PUBLISHED)
      .maybeSingle();
    if (error) throw error;
    if (!content) return { success: true, data: null };

    const sections = [...content.com_m_video_section]
      .sort(byOrder)
      .map((s) => ({ ...s, videos: [...s.com_m_video].sort(byOrder) }))
      .filter((s) => s.videos.length > 0);
    const videos = sections.flatMap((s) => s.videos);

    const [{ data: progressRows, error: progressError }, urls] = await Promise.all([
      videos.length > 0
        ? supabase
            .from('student_m_video_progress')
            .select('video_id, last_position_sec, completed_at')
            .eq('user_id', user.id)
            .in(
              'video_id',
              videos.map((v) => v.video_id),
            )
        : Promise.resolve({ data: [], error: null }),
      getVideoFileUrls(videos.flatMap((v) => [v.video_path, v.thumbnail_path])),
    ]);
    if (progressError) throw progressError;
    const progressByVideo = new Map<string, StudentVideoProgress>(
      (progressRows ?? []).map((p) => [
        p.video_id,
        { last_position_sec: p.last_position_sec, completed_at: p.completed_at },
      ]),
    );

    const data: StudentVideoContent = {
      content_id: content.content_id,
      content_name: content.content_name,
      description: content.description,
      sections: sections.map((s) => ({
        section_id: s.section_id,
        section_name: s.section_name,
        videos: s.videos.map((v) => ({
          video_id: v.video_id,
          title: v.title,
          description: v.description,
          duration_sec: v.duration_sec,
          video_url: urls.get(v.video_path) ?? null,
          thumbnail_url: v.thumbnail_path ? (urls.get(v.thumbnail_path) ?? null) : null,
          progress: progressByVideo.get(v.video_id) ?? null,
        })),
      })),
    };
    return { success: true, data };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('video:get_content_failed', getErrorMessage(err), { ...ctx, err, payload: { contentId } });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ビデオ1本の再生用のデータ（ホームのその場の再生で、開いた時に取得する）。公開中の教材のビデオだけで、
 * 見えないビデオは data が null。教材の画面と同じく、本人の権限（RLS）で読めた行にだけ署名付き URL を作る
 */
export async function getStudentVideo(videoId: string): Promise<ActionResult<{ data: StudentVideoItem | null }>> {
  const ctx = await getLogContext();
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, message: 'ログインしてください' };
    const supabase = await createServerClient();

    const [{ data: video, error }, { data: progress, error: progressError }] = await Promise.all([
      supabase
        .from('com_m_video')
        .select(
          'video_id, title, description, duration_sec, video_path, thumbnail_path, com_m_video_section!inner(com_m_contents!inner(content_type, status))',
        )
        .eq('video_id', videoId)
        .eq('com_m_video_section.com_m_contents.content_type', VIDEO_CONTENT_TYPE)
        .eq('com_m_video_section.com_m_contents.status', CONTENT_STATUS.PUBLISHED)
        .maybeSingle(),
      supabase
        .from('student_m_video_progress')
        .select('last_position_sec, completed_at')
        .eq('user_id', user.id)
        .eq('video_id', videoId)
        .maybeSingle(),
    ]);
    if (error) throw error;
    if (progressError) throw progressError;
    if (!video) return { success: true, data: null };

    const urls = await getVideoFileUrls([video.video_path, video.thumbnail_path]);
    return {
      success: true,
      data: {
        video_id: video.video_id,
        title: video.title,
        description: video.description,
        duration_sec: video.duration_sec,
        video_url: urls.get(video.video_path) ?? null,
        thumbnail_url: video.thumbnail_path ? (urls.get(video.thumbnail_path) ?? null) : null,
        progress: progress ?? null,
      },
    };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('video:get_video_failed', getErrorMessage(err), { ...ctx, err, payload: { videoId } });
    return { success: false, message: '動画を読み込めませんでした' };
  }
}

/**
 * 視聴の進み具合を保存する（再生中に定期的に・一時停止・終了・画面を離れる時）。
 * 最後まで見た時は completed を付ける（初めて見終えた日時を残すため、見終えたことのあるビデオでは付けない）。
 * 本人の権限で書き、本人に見えないビデオの行は RLS で書けない
 */
export async function saveVideoProgress(input: {
  videoId: string;
  positionSec: number;
  completed: boolean;
}): Promise<ActionResult> {
  const ctx = await getLogContext();
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, message: 'ログインしてください' };
    const position = Number.isFinite(input.positionSec) ? Math.max(0, Math.round(input.positionSec)) : 0;
    const now = new Date().toISOString();

    const supabase = await createServerClient();
    const { error } = await supabase.from('student_m_video_progress').upsert(
      {
        user_id: user.id,
        video_id: input.videoId,
        last_position_sec: position,
        last_viewed_at: now,
        ...(input.completed ? { completed_at: now } : {}),
      },
      { onConflict: 'user_id,video_id' },
    );
    if (error) throw error;
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('video:save_progress_failed', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { videoId: input.videoId },
    });
    return { success: false, message: '視聴の記録を保存できませんでした' };
  }
}

/**
 * ブックマークして終了（ホームの「続きから」で、このビデオから再開する）。再生位置は視聴の進み具合に残る
 */
export async function saveVideoBookmark(input: {
  contentId: string;
  videoId: string;
  videoTitle: string;
  positionSec: number;
  progressPercent: number;
}): Promise<ActionResult> {
  const ctx = await getLogContext();
  try {
    const position = Math.max(0, Math.round(input.positionSec));
    const metadata: VideoResumeMetadata = {
      type: 'video',
      video_id: input.videoId,
      video_time: position,
      display: {
        progress_percent: Math.min(100, Math.max(0, Math.round(input.progressPercent))),
        position_text: formatVideoDuration(position),
        last_unit_name: input.videoTitle,
      },
    };
    await saveResumeContent(input.contentId, input.videoId, metadata);
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('video:save_bookmark_failed', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { contentId: input.contentId, videoId: input.videoId },
    });
    return { success: false, message: 'ブックマークできませんでした' };
  }
}
