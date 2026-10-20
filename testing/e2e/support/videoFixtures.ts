import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { newTag } from './authFixtures.ts';

/**
 * ビデオ教材の使い捨てデータ（教材・セクション・ビデオと、ビデオのバケットのファイル）。
 * 教材名は `【QAテスト】ビデオ教材E2E（${tag}）`（残骸は authFixtures.leftovers.ts が確かめる）。
 * ファイルはアプリ（packages/lib/video/storage.ts）と同じバケットを直接扱う（置き場所を R2 に移したら、ここも合わせて直す）。
 */

/** ビデオのバケット（R2 に移るまでは dev の Supabase Storage の一時のバケット） */
export const VIDEO_BUCKET = 'video';

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/video');

/** テスト用のファイル（ffmpeg の合成のテストパターン。数KB） */
export const VIDEO_FILES = {
  /** 2秒の MP4 */
  short: path.join(FIXTURE_DIR, 'sample-2s.mp4'),
  /** 3秒の MP4 */
  long: path.join(FIXTURE_DIR, 'sample-3s.mp4'),
  /** 20秒の MP4（続きからの再生位置を確かめる用。5秒より前は最初から再生するため） */
  twenty: path.join(FIXTURE_DIR, 'sample-20s.mp4'),
  thumbnail: path.join(FIXTURE_DIR, 'thumbnail.png'),
} as const;

export const VIDEO_CONTENT_NAME_PREFIX = '【QAテスト】ビデオ教材E2E（';

export function newVideoContentTag(): string {
  return newTag('video');
}

export function videoContentName(tag: string): string {
  return `${VIDEO_CONTENT_NAME_PREFIX}${tag}）`;
}

export async function videoFileExists(admin: SupabaseClient, key: string): Promise<boolean> {
  const { error } = await admin.storage.from(VIDEO_BUCKET).info(key);
  return !error;
}

interface SeedVideo {
  title: string;
  status?: 0 | 1;
  /** 置く動画（既定は2秒） */
  file?: 'short' | 'twenty';
}

const SEED_FILE_DURATION = { short: 2, twenty: 20 } as const;

export interface SeededVideoContent {
  contentId: string;
  sections: {
    sectionId: string;
    name: string | null;
    videos: { videoId: string; title: string; videoPath: string }[];
  }[];
}

/**
 * 画面を通さずにビデオ教材を作る（セクションごとのビデオ）。画面の登録の操作そのものを確かめないテストの前提に使う。
 * 既定は非公開・共通の教材。生徒に見せる場合は `published` と、公開先の使い捨ての顧客（`accessClientId`）を渡す
 * （限定公開にし、その顧客の生徒にだけ見せる。固定アカウントの教材一覧に出さないため）。
 */
export async function seedVideoContent(
  admin: SupabaseClient,
  tag: string,
  sections: { name: string | null; videos: SeedVideo[] }[],
  options: { published?: boolean; accessClientId?: string } = {},
): Promise<SeededVideoContent> {
  if (options.published && !options.accessClientId) throw new Error('公開する教材には公開先の顧客を指定してください');
  const { data: content, error } = await admin
    .from('com_m_contents')
    .insert({
      content_name: videoContentName(tag),
      content_label: tag,
      content_type: 1,
      category_id: 1,
      status: options.published ? 1 : 0,
      content_scope: options.accessClientId ? 1 : 0,
    })
    .select('content_id')
    .single();
  if (error) throw new Error(`ビデオ教材の作成に失敗しました: ${error.message}`);
  if (options.accessClientId) {
    const { error: accessError } = await admin
      .from('com_m_contents_access')
      .insert({ client_id: options.accessClientId, content_id: content.content_id });
    if (accessError) throw new Error(`教材の公開先の追加に失敗しました: ${accessError.message}`);
  }

  const bodies = { short: await readFile(VIDEO_FILES.short), twenty: await readFile(VIDEO_FILES.twenty) };
  const seeded: SeededVideoContent = { contentId: content.content_id as string, sections: [] };
  for (const [sectionIndex, section] of sections.entries()) {
    const { data: row, error: sectionError } = await admin
      .from('com_m_video_section')
      .insert({ content_id: seeded.contentId, section_name: section.name, seq_no: sectionIndex + 1 })
      .select('section_id')
      .single();
    if (sectionError) throw new Error(`セクションの作成に失敗しました: ${sectionError.message}`);

    const videos: SeededVideoContent['sections'][number]['videos'] = [];
    for (const [videoIndex, video] of section.videos.entries()) {
      const videoId = crypto.randomUUID();
      const videoPath = `${videoId}/${crypto.randomUUID()}.mp4`;
      const { error: uploadError } = await admin.storage
        .from(VIDEO_BUCKET)
        .upload(videoPath, bodies[video.file ?? 'short'], { contentType: 'video/mp4' });
      if (uploadError) throw new Error(`動画の配置に失敗しました: ${uploadError.message}`);
      const { error: videoError } = await admin.from('com_m_video').insert({
        video_id: videoId,
        section_id: row.section_id,
        title: video.title,
        video_path: videoPath,
        duration_sec: SEED_FILE_DURATION[video.file ?? 'short'],
        seq_no: videoIndex + 1,
        status: video.status ?? 0,
      });
      if (videoError) throw new Error(`ビデオの作成に失敗しました: ${videoError.message}`);
      videos.push({ videoId, title: video.title, videoPath });
    }
    seeded.sections.push({ sectionId: row.section_id as string, name: section.name, videos });
  }
  return seeded;
}

/**
 * 使い捨てのビデオ教材と、そのビデオのファイルを消す（教材を消すとセクション・ビデオは CASCADE で消える）。
 * 視聴の記録（student_m_video_progress）が残っていると RESTRICT で止まるため、生徒の後始末（cleanupAuthFixture）の後に呼ぶ。
 * 失敗は警告だけ出して続ける（後始末のため）。
 */
export async function cleanupVideoContents(admin: SupabaseClient, contentIds: string[]): Promise<void> {
  if (contentIds.length === 0) return;
  const { data: videos } = await admin
    .from('com_m_video')
    .select('video_path, thumbnail_path, com_m_video_section!inner(content_id)')
    .in('com_m_video_section.content_id', contentIds);
  const keys = (videos ?? [])
    .flatMap((v) => [v.video_path as string, v.thumbnail_path as string | null])
    .filter((k): k is string => !!k);

  const { error } = await admin.from('com_m_contents').delete().in('content_id', contentIds);
  if (error) console.warn(`[videoFixtures] ビデオ教材の削除に失敗: ${contentIds.join(',')} ${error.message}`);
  if (keys.length > 0) {
    const { error: removeError } = await admin.storage.from(VIDEO_BUCKET).remove(keys);
    if (removeError) console.warn(`[videoFixtures] ビデオのファイルの削除に失敗: ${removeError.message}`);
  }
}

/** 教材名のタグから使い捨てのビデオ教材の ID を探す（画面で作った教材の後始末用） */
export async function findVideoContentIds(admin: SupabaseClient, tag: string): Promise<string[]> {
  const { data } = await admin.from('com_m_contents').select('content_id').eq('content_name', videoContentName(tag));
  return (data ?? []).map((c) => c.content_id as string);
}
