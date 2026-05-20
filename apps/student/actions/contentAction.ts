"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { ContentItem, FavoriteContentItem } from "@gabby/types/content";
import { ResumeContentResponse, ResumeMetadata } from "@gabby/types/training";
import { createLogger, getLogContext } from "@gabby/lib/logger";

const logger = createLogger('student');

// 全コンテンツを取得
export async function getAllContent(): Promise<ContentItem[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    
    // RLSにより、ログインユーザーがアクセス権を持つレコードのみが自動的に返る
    const { data, error } = await supabase
      .from('com_m_contents')
      .select(`
        *,
        tags:com_t_contents_tag_rel(
          tag:com_m_contents_tag(tag_id, tag_name, tag_type)
        ),
        is_favorite:com_t_favorite_contents(count)
      `)
      .eq('delete_flg', '0')
      .neq('content_scope', 9)
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error("content:get_all_failed", error.message, ctx);
      return [];
    }

    return (data || []).map(c => ({
      ...c,
      // countオブジェクトからbooleanへ変換
      is_favorite: ((c.is_favorite as any)?.[0]?.count || 0) > 0,
      // タグのリレーションをフラット化
      display_tags: c.tags
        ?.map((t: any) => t.tag)
        .filter((t: any) => t !== null) || []
    })) as unknown as ContentItem[];
  } catch (err) {
    logger.error("content:get_all_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return [];
  }
}

// お気に入りコンテンツを取得
export async function getFavoriteContentes(): Promise<FavoriteContentItem[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('com_t_favorite_contents')
      .select(`
        content:com_m_contents!inner(*)
      `)
      .eq('user_id', user.id)
      .eq('com_m_contents.delete_flg', '0')
      .neq('com_m_contents.content_scope', 9)
      .order('seq_no', { referencedTable: 'com_m_contents', ascending: true });

    if (error) {
      logger.error("content:get_favorites_failed", error.message, ctx);
      return [];
    }

    return (data || []).map(d => {
      const content = d.content as unknown as FavoriteContentItem;
      return {
        ...content,
        is_favorite: true,
      };
    });
  } catch (err) {
    logger.error("content:get_favorites_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return [];
  }
}

/**
 * コンテンツ（教材）のお気に入り状態を切り替え
 */
export async function toggleContentFavorite(contentId: string, isFavorite: boolean) {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    let error;
    if (isFavorite) {
      // お気に入り登録
      const { error: upsertError } = await supabase
        .from('com_t_favorite_contents')
        .upsert({ user_id: user.id, content_id: contentId });
      error = upsertError;
    } else {
      // 解除
      const { error: deleteError } = await supabase
        .from('com_t_favorite_contents')
        .delete()
        .match({ user_id: user.id, content_id: contentId });
      error = deleteError;
    }

    if (error) {
      logger.error("content:toggle_favorite_failed", error.message, { ...ctx, payload: { contentId, isFavorite } });
      throw error;
    }

    logger.info("content:toggle_favorite_success", `Favorite ${isFavorite ? 'added' : 'removed'}`, { ...ctx, payload: { contentId, isFavorite } });
  } catch (err) {
    logger.error("content:toggle_favorite_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { contentId, isFavorite } });
    throw err;
  }
}

/**
 * コンテンツの再開地点を保存する (栞を挟む)
 * metadata は ResumeMetadata (WordResumeMetadata | VideoResumeMetadata) を想定
 */
export async function saveResumeContent<T extends ResumeMetadata>(
  contentId: string, 
  itemId: string, 
  metadata: T
) {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // upsertにより、ユーザーごとに1件のみの再開情報を維持
    const { error } = await supabase
      .from('com_t_resume_contents')
      .upsert({
        user_id: user.id,
        content_id: contentId,
        item_id: itemId,
        metadata: metadata, // JSONBとして保存
        update_date: new Date().toISOString()
      }, {
        onConflict: 'user_id' // user_idが衝突したら更新
      });

    if (error) {
      logger.error("training:save_resume_failed", error.message, { ...ctx, payload: { contentId, itemId } });
      throw new Error(`栞の保存に失敗しました: ${error.message}`);
    }

    logger.info("training:save_resume_success", "Resume point saved", { ...ctx, payload: { contentId, itemId } });
  } catch (err) {
    logger.error("training:save_resume_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { contentId, itemId } });
    throw err;
  }
}

/**
 * 再開地点を削除する (栞を抜く)
 */
export async function clearResumeContent() {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await supabase
      .from('com_t_resume_contents')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      logger.error("training:clear_resume_failed", error.message, ctx);
      throw new Error(`栞の削除に失敗しました: ${error.message}`);
    }

    logger.info("training:clear_resume_success", "Resume point cleared", ctx);
  } catch (err) {
    logger.error("training:clear_resume_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    throw err;
  }
}

/**
 * 最新の再開地点を取得する
 */
export async function getLatestResumeContent(): Promise<ResumeContentResponse | null> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('com_t_resume_contents')
      .select(`
        user_id,
        content_id,
        item_id,
        metadata,
        update_date,
        com_m_contents (
          content_name,
          content_type,
          difficulty_level,
          content_label,
          metadata
        )
      `)
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // レコードなしは正常系
      logger.error("training:get_resume_failed", error.message, ctx);
      return null;
    }

    return data as unknown as ResumeContentResponse;
  } catch (err) {
    logger.error("training:get_resume_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return null;
  }
}