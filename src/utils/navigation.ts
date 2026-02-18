// src/utils/navigation.ts
import { CorpusRecord } from '@/types/corpus';
import { BaseResumeMetadata, ResumeCorpusResponse } from '@/types/training';

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
export const getTrainingPath = (corpus: CorpusRecord): string => {
  const segment = getSegment(corpus.corpus_type);
  return `/student/training/${segment}/${corpus.corpus_id}`;
};

/**
 * 2. 栞（Resume）から再開する場合
 * ResumeCorpusResponse 型をそのまま受け取れるようにする
 */
export const getResumePath = (resume: ResumeCorpusResponse<BaseResumeMetadata>): string => {
  const segment = getSegment(resume.com_m_corpus.corpus_type);
  // 再開フラグを付与
  return `/student/training/${segment}/${resume.corpus_id}?resume=true`;
};