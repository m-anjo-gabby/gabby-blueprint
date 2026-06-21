// 📄 packages/lib/navigation/student-path.ts

import { ContentItem } from '@gabby/types/content';
import { ResumeContentResponse } from '@gabby/types/training';

/**
 * 1. 通常のライブラリやおすすめ等から遷移する場合 (新規オープン)
 * 教材カードから Ready画面 (SprintSelect) へ、モードと種別を初期値として引き渡す
 */
export const getTrainingPath = (content: ContentItem): string => {
  // スプリント(content_type === 2) の場合
  if (content.content_type === 2) {
    const type = '0'; // 初期表示の質問タイプは '0' (Speed) 固定とする
    const contentId = content.content_id;
    const sprintMeta = content.metadata?.sprint;
    const sprintType = sprintMeta?.sprint_type ?? '0';

    // 🏎️ levelはReady画面側で動的に選ばせるため、URLからは除外
    // mode=drill と type を指定して、Ready画面の初期状態を制御する
    return `/training/sprint/play?mode=drill&type=${type}&content_id=${contentId}&sprint_type=${sprintType}`;
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
 * 栞から再開する場合も、Ready画面に種別をセットした状態で着地させる
 */
export const getResumePath = (resume: ResumeContentResponse): string => {
  const contentType = resume.com_m_contents.content_type;

  // スプリントの栞再開の場合
  if (contentType === 2) {
    const type = '0';
    const contentId = resume.content_id;
    const sprintMeta = resume.com_m_contents.metadata?.sprint;
    const sprintType = sprintMeta?.sprint_type ?? '0';
    const itemIdParam = resume.item_id ? `&resume_id=${resume.item_id}` : '';

    // 再開時も同様にReady画面を経由し、安全に物理タップ(Start)を挟んでiOS無音問題を回避
    return `/training/sprint/play?mode=drill&type=${type}&content_id=${contentId}&resume=true&sprint_type=${sprintType}${itemIdParam}`;
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