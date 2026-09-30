import type { ReactNode } from 'react';
import { BookOpen, MessageSquareQuote, Zap, type LucideIcon } from 'lucide-react';
import type { FavoriteContentItem } from '@gabby/types/content';
import type { FavoritePhraseItem } from '@gabby/types/word';
import { QUESTION_TYPES, type FavoriteSprintQuestionItem, type SprintQuestionType } from '@gabby/types/sprint';
import { getContentTypeConfig } from '@gabby/lib/content/ui';
import { formatSprintLevelLabel } from '@gabby/lib';
import { toggleContentFavorite } from '@/actions/contentAction';
import { toggleFavorite } from '@/actions/wordAction';
import { toggleSprintQuestionFavorite } from '@/actions/sprintFavoriteAction';
import { useContentStore } from '@/stores/useContentStore';
import { ContentFavoriteCard } from './ContentFavoriteCard';
import { PhraseFavoriteCard } from './PhraseFavoriteCard';
import { SprintQuestionFavoriteCard } from './SprintQuestionFavoriteCard';
import type { FavoriteFilterDef } from './favoriteFilters';

/**
 * お気に入りの種別ごとの項目の型。
 * 種別を追加するときは、ここに1行足し、FAVORITE_KINDS に定義を、page.tsx に取得処理を加える
 * （足りない箇所は型エラーで分かる）。
 */
export interface FavoriteItemMap {
  contents: FavoriteContentItem;
  phrases: FavoritePhraseItem;
  sprintQuestions: FavoriteSprintQuestionItem;
}

export type FavoriteKindId = keyof FavoriteItemMap;

/** 種別ごとのお気に入り一覧（サーバーで取得して画面に渡す） */
export type FavoriteLists = { [K in FavoriteKindId]: FavoriteItemMap[K][] };

export interface FavoriteKindDef<T> {
  /** ピルの表示名 */
  label: string;
  icon: LucideIcon;
  /** 「この◯◯を削除しますか」「お気に入りの◯◯はまだありません」等の文言に入る呼び名 */
  noun: string;
  searchPlaceholder: string;
  /** お気に入りが0件の時の、登録方法の案内 */
  emptyHint: string;
  emptyAction?: { label: string; href: string };
  /** PC（lg以上）での列数 */
  columns: 1 | 2;
  getKey: (item: T) => string;
  /** 検索対象の文字列（小文字化して部分一致で比較する） */
  getSearchText: (item: T) => string;
  /** 絞り込み（定義順に連動する。URLのクエリパラメータで状態を持つ） */
  filters: FavoriteFilterDef<T>[];
  /** お気に入り解除のサーバー処理（失敗時は例外を投げる） */
  remove: (item: T) => Promise<void>;
  renderItem: (item: T, onRemove: () => void) => ReactNode;
}

/** 出典の教材での絞り込み（フレーズ・スプリント問題で共通） */
function contentFilter<T>(getContent: (item: T) => { id: string; name: string } | null): FavoriteFilterDef<T> {
  return {
    id: 'content',
    label: '教材',
    allLabel: 'すべての教材',
    getOption: (item) => {
      const content = getContent(item);
      return content ? { id: content.id, label: content.name, order: 0 } : null;
    },
  };
}

export const FAVORITE_KINDS: { [K in FavoriteKindId]: FavoriteKindDef<FavoriteItemMap[K]> } = {
  contents: {
    label: '教材',
    icon: BookOpen,
    noun: '教材',
    searchPlaceholder: '教材名で検索',
    emptyHint: '教材一覧のカードの☆から登録できます',
    emptyAction: { label: '教材一覧を見る', href: '/library' },
    columns: 2,
    getKey: (c) => c.content_id,
    getSearchText: (c) => c.content_name,
    filters: [
      {
        id: 'type',
        label: '種別',
        allLabel: 'すべての種別',
        getOption: (c) => ({ id: String(c.content_type), label: getContentTypeConfig(c.content_type).label, order: c.content_type }),
      },
    ],
    remove: async (c) => {
      await toggleContentFavorite(c.content_id, false);
      // 教材一覧のキャッシュ（☆の状態）も合わせる
      useContentStore.getState().updateFavoriteStatus(c.content_id, false);
    },
    renderItem: (c, onRemove) => <ContentFavoriteCard content={c} onRemove={onRemove} />,
  },
  phrases: {
    label: 'フレーズ',
    icon: MessageSquareQuote,
    noun: 'フレーズ',
    searchPlaceholder: '英語・日本語で検索',
    emptyHint: '単語帳トレーニングのカードの☆から登録できます',
    emptyAction: { label: '教材一覧を見る', href: '/library' },
    columns: 1,
    getKey: (p) => p.phrase_id,
    getSearchText: (p) => [p.phrase_en, p.phrase_ja, p.word_en].filter(Boolean).join(' '),
    filters: [contentFilter((p) => p.content_id && p.content_name ? { id: p.content_id, name: p.content_name } : null)],
    remove: (p) => toggleFavorite(p.phrase_id, false),
    renderItem: (p, onRemove) => <PhraseFavoriteCard phrase={p} onRemove={onRemove} />,
  },
  sprintQuestions: {
    label: 'スプリント問題',
    icon: Zap,
    noun: '問題',
    searchPlaceholder: '英語・日本語で検索',
    emptyHint: 'スプリントの結果画面・履歴で、各問題の☆から登録できます',
    emptyAction: { label: 'スプリントの履歴を見る', href: '/training/sprint/history' },
    columns: 1,
    getKey: (q) => q.question_id,
    getSearchText: (q) => [
      q.statement_en, q.statement_ja, q.question_en, q.question_ja,
      q.answer_sentence_yes_en, q.answer_sentence_yes_ja, q.answer_sentence_no_en, q.answer_sentence_no_ja,
    ].filter(Boolean).join(' '),
    filters: [
      contentFilter((q) => ({ id: q.content_id, name: q.content_name })),
      {
        id: 'type',
        label: '問題種別',
        allLabel: 'すべての問題種別',
        getOption: (q) => {
          const type = QUESTION_TYPES[q.question_type as SprintQuestionType];
          return { id: q.question_type, label: type?.label ?? q.question_type, order: type?.seq_no ?? 99 };
        },
      },
      {
        // レベル分けの無い教材（コーパススプリント）の問題は対象外。レベルの意味は問題種別ごとに違うため、種別を選んでから出す
        id: 'level',
        label: 'レベル',
        allLabel: 'すべてのレベル',
        requires: 'type',
        getOption: (q) => q.has_level
          ? { id: String(q.difficulty_level), label: formatSprintLevelLabel(q.question_type, q.difficulty_level), order: q.difficulty_level }
          : null,
      },
    ],
    remove: (q) => toggleSprintQuestionFavorite(q.question_id, false),
    renderItem: (q, onRemove) => <SprintQuestionFavoriteCard question={q} onRemove={onRemove} />,
  },
};

/** ピルの並び順（FAVORITE_KINDS の定義順） */
export const FAVORITE_KIND_IDS = Object.keys(FAVORITE_KINDS) as FavoriteKindId[];

export function parseFavoriteKind(value: string | null): FavoriteKindId | null {
  return FAVORITE_KIND_IDS.find((id) => id === value) ?? null;
}
