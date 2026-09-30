import type { ReactNode } from 'react';
import { BookOpen, MessageSquareQuote, Zap, type LucideIcon } from 'lucide-react';
import type { FavoriteContentItem } from '@gabby/types/content';
import type { FavoritePhraseItem } from '@gabby/types/word';
import type { FavoriteSprintQuestionItem } from '@gabby/types/sprint';
import { getContentTypeConfig } from '@gabby/lib/content/ui';
import { toggleContentFavorite } from '@/actions/contentAction';
import { toggleFavorite } from '@/actions/wordAction';
import { toggleSprintQuestionFavorite } from '@/actions/sprintFavoriteAction';
import { useContentStore } from '@/stores/useContentStore';
import { ContentFavoriteCard } from './ContentFavoriteCard';
import { PhraseFavoriteCard } from './PhraseFavoriteCard';
import { SprintQuestionFavoriteCard } from './SprintQuestionFavoriteCard';

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

export interface FavoriteGroup {
  id: string;
  label: string;
}

export interface FavoriteKindDef<T> {
  /** ピルの表示名 */
  label: string;
  icon: LucideIcon;
  /** 「この◯◯を削除しますか」「お気に入りの◯◯はまだありません」等の文言に入る呼び名 */
  noun: string;
  searchPlaceholder: string;
  /** 絞り込みセレクトの「すべて」の表示名 */
  allGroupsLabel: string;
  /** お気に入りが0件の時の、登録方法の案内 */
  emptyHint: string;
  emptyAction?: { label: string; href: string };
  /** PC（lg以上）での列数 */
  columns: 1 | 2;
  getKey: (item: T) => string;
  /** 検索対象の文字列（小文字化して部分一致で比較する） */
  getSearchText: (item: T) => string;
  /** 絞り込みセレクトの分類 */
  getGroup: (item: T) => FavoriteGroup;
  /** お気に入り解除のサーバー処理（失敗時は例外を投げる） */
  remove: (item: T) => Promise<void>;
  renderItem: (item: T, onRemove: () => void) => ReactNode;
}

export const FAVORITE_KINDS: { [K in FavoriteKindId]: FavoriteKindDef<FavoriteItemMap[K]> } = {
  contents: {
    label: '教材',
    icon: BookOpen,
    noun: '教材',
    searchPlaceholder: '教材名で検索',
    allGroupsLabel: 'すべての種別',
    emptyHint: '教材一覧のカードの☆から登録できます',
    emptyAction: { label: '教材一覧を見る', href: '/library' },
    columns: 2,
    getKey: (c) => c.content_id,
    getSearchText: (c) => c.content_name,
    getGroup: (c) => ({ id: String(c.content_type), label: getContentTypeConfig(c.content_type).label }),
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
    allGroupsLabel: 'すべての教材',
    emptyHint: '単語帳トレーニングのカードの☆から登録できます',
    emptyAction: { label: '教材一覧を見る', href: '/library' },
    columns: 1,
    getKey: (p) => p.phrase_id,
    getSearchText: (p) => [p.phrase_en, p.phrase_ja, p.word_en].filter(Boolean).join(' '),
    getGroup: (p) => ({ id: p.content_id ?? '', label: p.content_name ?? '教材' }),
    remove: (p) => toggleFavorite(p.phrase_id, false),
    renderItem: (p, onRemove) => <PhraseFavoriteCard phrase={p} onRemove={onRemove} />,
  },
  sprintQuestions: {
    label: 'スプリント問題',
    icon: Zap,
    noun: '問題',
    searchPlaceholder: '英語・日本語で検索',
    allGroupsLabel: 'すべての教材',
    emptyHint: 'スプリントの結果画面・履歴で、各問題の☆から登録できます',
    emptyAction: { label: 'スプリントの履歴を見る', href: '/training/sprint/history' },
    columns: 1,
    getKey: (q) => q.question_id,
    getSearchText: (q) => [
      q.statement_en, q.statement_ja, q.question_en, q.question_ja,
      q.answer_sentence_yes_en, q.answer_sentence_yes_ja, q.answer_sentence_no_en, q.answer_sentence_no_ja,
    ].filter(Boolean).join(' '),
    getGroup: (q) => ({ id: q.content_id, label: q.content_name }),
    remove: (q) => toggleSprintQuestionFavorite(q.question_id, false),
    renderItem: (q, onRemove) => <SprintQuestionFavoriteCard question={q} onRemove={onRemove} />,
  },
};

/** ピルの並び順（FAVORITE_KINDS の定義順） */
export const FAVORITE_KIND_IDS = Object.keys(FAVORITE_KINDS) as FavoriteKindId[];

export function parseFavoriteKind(value: string | null): FavoriteKindId | null {
  return FAVORITE_KIND_IDS.find((id) => id === value) ?? null;
}
