// src/utils/navigation.ts
import { ContentItem } from '@/types/content';
import { BaseResumeMetadata, ResumeContentResponse } from '@/types/training';

/**
 * コーパスタイプからパスのセグメント名を取得するコアロジック
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
 * ResumeContentResponse 型をそのまま受け取れるようにする
 */
export const getResumePath = (resume: ResumeContentResponse<BaseResumeMetadata>): string => {
  const segment = getSegment(resume.com_m_contents.content_type);
  // 再開フラグを付与
  return `/student/training/${segment}/${resume.content_id}?resume=true`;
};