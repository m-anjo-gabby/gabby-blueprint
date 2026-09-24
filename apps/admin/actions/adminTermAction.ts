'use server';

import { createServerClient } from "@gabby/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatToJstDate, formatToJstDateTime, getUtcRangeFromJstDate } from "@gabby/lib/date/date";
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import type { TermDetail, TermListItem, TermType } from '@gabby/types/term';

const logger = createLogger('admin');

/**
 * 規約操作の失敗理由。画面側で翻訳カタログ（terms.errors.*）に変換して表示する。
 */
export type TermActionErrorCode =
  | 'DUPLICATE_VERSION'
  | 'CHANGE_NOTE_REQUIRED'
  | 'CONTENT_UNCHANGED'
  | 'PUBLISHED_NOT_DELETABLE'
  | 'UNEXPECTED';

export type TermActionResult =
  | { success: true }
  | { success: false; errorCode: TermActionErrorCode };

/** RPCの例外メッセージ（DDL/function/add_term_revision.sql 等）を画面向けのエラーコードに変換する */
function toErrorCode(message: string): TermActionErrorCode {
  if (message.includes('change_note is required')) return 'CHANGE_NOTE_REQUIRED';
  if (message.includes('content is unchanged')) return 'CONTENT_UNCHANGED';
  return 'UNEXPECTED';
}

/** 多対一の埋め込み結果（型推論上は配列になる）を単一行として取り出す */
function pickOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * 規約情報の一覧取得
 */
export async function getTerms(page: number = 1, pageSize: number = 10, searchQuery?: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const now = new Date();
    const nowIso = now.toISOString();

    let query = supabase
      .from('com_m_terms')
      .select('term_id, term_type, version_name, is_required, published_date', { count: 'exact' });

    if (searchQuery) {
      query = query.ilike('version_name', `%${searchQuery}%`);
    }

    // 「公開中」判定はページ・検索条件に依存させず、全件から種別ごとに現在有効な最新版を求める
    const [listResult, publishedResult] = await Promise.all([
      query
        .order('term_type', { ascending: true })
        .order('published_date', { ascending: false })
        .order('term_id', { ascending: true }) // 同順位の並びを一意に固定し、range(LIMIT/OFFSET)でのページ間の重複・欠落を防ぐ
        .range(from, to),
      supabase
        .from('com_m_terms')
        .select('term_id, term_type')
        .lte('published_date', nowIso)
        .order('published_date', { ascending: false }),
    ]);

    const error = listResult.error ?? publishedResult.error;
    if (error) {
      logger.error('term:get_terms_failed', error.message, { ...ctx, payload: { page, pageSize, searchQuery } });
      throw error;
    }

    const currentIds = new Set<string>();
    const seenTypes = new Set<string>();
    for (const term of publishedResult.data ?? []) {
      if (!seenTypes.has(term.term_type)) {
        seenTypes.add(term.term_type);
        currentIds.add(term.term_id);
      }
    }

    const terms: TermListItem[] = (listResult.data ?? []).map((term) => ({
      term_id: term.term_id,
      term_type: term.term_type as TermType,
      version_name: term.version_name,
      is_required: term.is_required,
      published_date: formatToJstDate(term.published_date),
      is_upcoming: new Date(term.published_date) > now,
      is_current: currentIds.has(term.term_id),
    }));

    return {
      terms,
      totalCount: listResult.count || 0,
    };
  } catch (error) {
    logger.error('term:get_terms_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { page, pageSize, searchQuery } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 規約の削除（公開前のバージョンのみ。リビジョンはON DELETE CASCADEで削除される）
 */
export async function deleteTerm(termId: string): Promise<TermActionResult> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();

    const { data: deleted, error } = await supabase
      .from('com_m_terms')
      .delete()
      .eq('term_id', termId)
      .gt('published_date', new Date().toISOString())
      .select('term_id');

    if (error) {
      logger.error('term:delete_term_failed', error.message, { ...ctx, payload: { termId } });
      return { success: false, errorCode: 'UNEXPECTED' };
    }

    if (!deleted || deleted.length === 0) {
      logger.warn('term:delete_term_rejected', 'Term is already published or not found', { ...ctx, payload: { termId } });
      return { success: false, errorCode: 'PUBLISHED_NOT_DELETABLE' };
    }

    logger.info('term:delete_term_success', `Term deleted`, { ...ctx, payload: { termId } });

    revalidatePath('/terms');
    return { success: true };
  } catch (error) {
    logger.error('term:delete_term_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { termId } });
    return { success: false, errorCode: 'UNEXPECTED' };
  }
}

/**
 * 編集画面用: 規約バージョンとリビジョン履歴（新しい順）の取得。存在しない場合は null。
 */
export async function getTermDetail(termId: string): Promise<TermDetail | null> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('com_m_terms')
      .select(`
        term_id,
        term_type,
        version_name,
        published_date,
        com_m_terms_revision (
          revision_id,
          revision_no,
          content,
          change_note,
          insert_date,
          com_m_user ( user_name )
        )
      `)
      .eq('term_id', termId)
      .order('revision_no', { referencedTable: 'com_m_terms_revision', ascending: false })
      .maybeSingle();

    if (error) {
      logger.error('term:get_term_detail_failed', error.message, { ...ctx, payload: { termId } });
      throw error;
    }
    if (!data) return null;

    return {
      term_id: data.term_id,
      term_type: data.term_type as TermType,
      version_name: data.version_name,
      is_published: new Date(data.published_date) <= new Date(),
      revisions: data.com_m_terms_revision.map((rev) => ({
        revision_id: rev.revision_id,
        revision_no: rev.revision_no,
        content: rev.content,
        change_note: rev.change_note,
        insert_user_name: pickOne(rev.com_m_user)?.user_name ?? null,
        insert_date: formatToJstDateTime(rev.insert_date),
      })),
    };
  } catch (error) {
    logger.error('term:get_term_detail_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { termId } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 規約本文の修正（リビジョン追加 = サイレント更新。ユーザーへの再同意は求めない）
 * 公開済みバージョンへの修正は修正理由（changeNote）が必須（RPC側でも検証）。
 */
export async function addTermRevision(
  termId: string,
  content: string,
  changeNote: string
): Promise<TermActionResult> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: revisionNo, error } = await supabase.rpc('add_term_revision', {
      p_term_id: termId,
      p_content: content,
      p_change_note: changeNote,
    });

    if (error) {
      const errorCode = toErrorCode(error.message);
      logger.error('term:add_revision_failed', error.message, { ...ctx, payload: { termId, changeNote } });
      return { success: false, errorCode };
    }

    logger.info('term:add_revision_success', `Term revision added`, { ...ctx, payload: { termId, revisionNo, changeNote } });

    revalidatePath('/terms');
    revalidatePath(`/terms/${termId}/edit`);
    return { success: true };
  } catch (error) {
    logger.error('term:add_revision_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { termId } });
    return { success: false, errorCode: 'UNEXPECTED' };
  }
}

/**
 * 規約の新規作成（新バージョン＋リビジョン1。必須規約なら公開日以降に全ユーザーへ再同意を求める）
 */
export async function createTerm(params: {
  term_type: string;
  version_name: string;
  published_date: string; // "YYYY-MM-DD" 形式（JST）
  is_required: boolean;
  content: string;
}): Promise<TermActionResult> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();

    // 公開日のUTC変換 (日付のみ入力からJST 00:00:00のUTC値を生成)
    const { startUtc: publishedUtc } = getUtcRangeFromJstDate(params.published_date, params.published_date);

    const { data: termId, error } = await supabase.rpc('create_term', {
      p_term_type: params.term_type,
      p_version_name: params.version_name,
      p_published_date: publishedUtc,
      p_is_required: params.is_required,
      p_content: params.content,
    });

    if (error) {
      if (error.code === '23505') {
        return { success: false, errorCode: 'DUPLICATE_VERSION' };
      }
      logger.error("term:create_term_failed", error.message, { ...ctx, payload: { ...params, content: undefined } });
      return { success: false, errorCode: 'UNEXPECTED' };
    }

    logger.info('term:create_term_success', `Term created`, { ...ctx, payload: { termId } });
    revalidatePath('/terms');
    return { success: true };
  } catch (error) {
    logger.error("term:create_term_unexpected", error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { ...params, content: undefined } });
    return { success: false, errorCode: 'UNEXPECTED' };
  }
}
