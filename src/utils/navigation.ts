import { ContentItem } from '@/types/content';
import { ResumeContentResponse } from '@/types/training';

/**
 * コンテンツタイプからパスのセグメント名を取得する
 */
const getSegment = (type: number): string => {
  const pathSegments: Record<number, string> = {
    0: 'word',
    1: 'video',
  };
  return pathSegments[type] || 'word';
};

/**
 * 1. 通常のライブラリやおすすめ等から遷移する場合
 */
export const getTrainingPath = (content: ContentItem): string => {
  const segment = getSegment(content.content_type);
  return `/student/training/${segment}/${content.content_id}`;
};

/**
 * 2. 栞（Resume）から再開する場合
 * ResumeContentResponse は現在ジェネリックではないため、そのまま受け取ります
 */
export const getResumePath = (resume: ResumeContentResponse): string => {
  const segment = getSegment(resume.com_m_contents.content_type);
  // 再開フラグを付与
  return `/student/training/${segment}/${resume.content_id}?resume=true`;
};