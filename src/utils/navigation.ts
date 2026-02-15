// src/lib/navigation.ts
import { CorpusRecord } from '@/types/corpus';

/**
 * コーパスの種類(number)をパス文字列に変換する
 * 0: vocabulary, 2: video, ...
 */
export const getTrainingPath = (corpus: CorpusRecord): string => {
  const type = corpus.corpus_type;
  
  // DBの数値とURLセグメントのマッピング
  const pathSegments: Record<number, string> = {
    0: 'vocabulary',
    2: 'video',
    // 3: 'sprint', // 今後追加する場合
  };

  const segment = pathSegments[type] || 'vocabulary';
  return `/student/training/${segment}/${corpus.corpus_id}`;
};