// 📄 packages/lib/navigation/student-path.ts

import { ContentItem } from '@gabby/types/content';
import { ResumeContentResponse } from '@gabby/types/training';

/**
 * 1. 通常のライブラリやおすすめ等から遷移する場合 (新規オープン)
 */
export const getTrainingPath = (content: ContentItem): string => {
  // スプリント(content_type === 2) の場合はクエリパラメータ形式のURLを生成
  if (content.content_type === 2) {
    const sprintMeta = content.metadata?.sprint;
    const type = sprintMeta?.question_type ?? '0';
    const level = sprintMeta?.level ?? '1';
    const contentId = content.content_id;

    // 🏎️ mode=drill, type, level, content_id をすべて載せて play ページへルーティング
    return `/training/sprint/play?mode=drill&type=${type}&level=${level}&content_id=${contentId}`;
  }

  // 0: 単語帳, 1: ビデオ などの従来コンテンツはそのままのセグメントを使用
  const pathSegments: Record<number, string> = {
    0: 'word',
    1: 'video',
  };
  const segment = pathSegments[content.content_type] || 'word';
  return `/training/${segment}/${content.content_id}`;
};

/**
 * 2. 栞（Resume）から再開する場合
 */
export const getResumePath = (resume: ResumeContentResponse): string => {
  const contentType = resume.com_m_contents.content_type;

  // スプリントの栞再開の場合
  if (contentType === 2) {
    const sprintMeta = resume.com_m_contents.metadata?.sprint;
    const type = sprintMeta?.question_type ?? '0';
    const level = sprintMeta?.level ?? '1';
    const contentId = resume.content_id;
    const itemIdParam = resume.item_id ? `&resume_id=${resume.item_id}` : '';

    return `/training/sprint/play?mode=drill&type=${type}&level=${level}&content_id=${contentId}&resume=true${itemIdParam}`;
  }

  // 従来コンテンツの再開用URL生成
  const pathSegments: Record<number, string> = {
    0: 'word',
    1: 'video',
  };
  const segment = pathSegments[contentType] || 'word';
  const itemIdParam = resume.item_id ? `&resume_id=${resume.item_id}` : '';
  return `/training/${segment}/${resume.content_id}?resume=true${itemIdParam}`;
};