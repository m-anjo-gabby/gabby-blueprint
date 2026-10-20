import type { TableRow } from './db';

/**
 * ビデオ教材（com_m_contents.content_type = 1。1シリーズ = 1教材）の区分値と行の型。
 * セクション・ビデオ・視聴の進み具合は com_m_video_section / com_m_video / student_m_video_progress。
 */

/**
 * ビデオ教材の種類（com_m_contents.category_id）。
 * category_id の意味は content_type ごとに違い DB の CHECK が無いため、ここで確かめる。
 */
export const VIDEO_CATEGORY = {
  PRONUNCIATION: 1,
  ON_DEMAND: 2,
  COLOR_VOWEL: 3,
} as const;
export type VideoCategory = (typeof VIDEO_CATEGORY)[keyof typeof VIDEO_CATEGORY];

const VIDEO_CATEGORY_VALUES: readonly number[] = Object.values(VIDEO_CATEGORY);

export function isVideoCategory(value: unknown): value is VideoCategory {
  return typeof value === 'number' && VIDEO_CATEGORY_VALUES.includes(value);
}

// 公開状態（com_m_video.status。新規作成時は非公開）
export const VIDEO_STATUS = {
  UNPUBLISHED: 0,
  PUBLISHED: 1,
} as const;
export type VideoStatus = (typeof VIDEO_STATUS)[keyof typeof VIDEO_STATUS];

export type VideoSectionRow = TableRow<'com_m_video_section'>;
export type VideoRow = TableRow<'com_m_video'>;
export type VideoProgressRow = TableRow<'student_m_video_progress'>;

/** admin のエディタのビデオ（サムネイルは表示用の署名付き URL を添える） */
export interface AdminVideoItem extends VideoRow {
  thumbnail_url: string | null;
}

/** admin のエディタのセクション（ビデオは seq_no の順） */
export interface AdminVideoSection extends VideoSectionRow {
  videos: AdminVideoItem[];
}

/** 生徒の視聴の進み具合（見ていないビデオは null） */
export type StudentVideoProgress = Pick<VideoProgressRow, 'last_position_sec' | 'completed_at'>;

/** 生徒の教材の画面のビデオ（公開中だけ。動画・サムネイルは再生・表示用の署名付き URL） */
export interface StudentVideoItem {
  video_id: string;
  title: string;
  description: string | null;
  duration_sec: number | null;
  video_url: string | null;
  thumbnail_url: string | null;
  progress: StudentVideoProgress | null;
}

/** 生徒の教材の画面のセクション（公開中のビデオが無いセクションは含めない） */
export interface StudentVideoSection {
  section_id: string;
  section_name: string | null;
  videos: StudentVideoItem[];
}

/** 生徒の教材の画面のデータ */
export interface StudentVideoContent {
  content_id: string;
  content_name: string;
  description: string | null;
  sections: StudentVideoSection[];
}

/** ビデオの移動先の候補（ビデオ教材ごとのセクション） */
export interface VideoMoveTarget {
  content_id: string;
  content_name: string;
  sections: Pick<VideoSectionRow, 'section_id' | 'section_name' | 'seq_no'>[];
}
