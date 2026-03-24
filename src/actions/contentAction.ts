"use server";

import { createClient } from "@/lib/server";
import { ContentItem, FavoriteContentItem } from "@/types/content";
import { BaseResumeMetadata, ResumeContentResponse } from "@/types/training";

// 全コンテンツを取得
export async function getAllContent(): Promise<ContentItem[]> {
  const supabase = await createClient();
  
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
    .order('seq_no', { ascending: true });

  if (error) {
    console.error("Fetch Error:", error);
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
}

// お気に入りコンテンツを取得
export async function getFavoriteContentes(): Promise<FavoriteContentItem[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('com_t_favorite_contents')
    .select(`
      content:com_m_contents!inner(*)
    `)
    .eq('user_id', user.id)
    .eq('com_m_contents.delete_flg', '0')
    .order('seq_no', { referencedTable: 'com_m_contents', ascending: true });

  if (error || !data) {
    console.error("Fetch Error:", error);
    return [];
  }

  // d.content は FavoriteContentRecord から is_favorite を除いたものと一致するはずです
  return data.map(d => {
    const content = d.content as unknown as FavoriteContentItem;
    return {
      ...content,
      is_favorite: true,
    };
  });
}

/**
 * コンテンツ（教材）のお気に入り状態を切り替え
 */
export async function toggleContentFavorite(contentId: string, isFavorite: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  if (isFavorite) {
    // お気に入り登録
    await supabase
      .from('com_t_favorite_contents')
      .upsert({ user_id: user.id, content_id: contentId });
  } else {
    // 解除
    await supabase
      .from('com_t_favorite_contents')
      .delete()
      .match({ user_id: user.id, content_id: contentId });
  }
}

/**
 * コンテンツの再開地点を保存する (栞を挟む)
 * T は BaseResumeMetadata を継承した具体的なメタデータ型
 */
export async function saveResumeContent<T extends BaseResumeMetadata>(
  contentId: string, 
  itemId: string, 
  metadata: T
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from('com_t_resume_contents')
    .upsert({
      user_id: user.id,
      content_id: contentId,
      item_id: itemId,
      metadata: metadata, // metadataフィールドはJSONBなので型安全に保存可能
      update_date: new Date().toISOString()
    });

  if (error) {
    console.error("Save resume content error:", error);
    throw new Error(`栞の保存に失敗しました: ${error.message}`);
  }
}

/**
 * 再開地点を削除する (栞を抜く)
 */
export async function clearResumeContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from('com_t_resume_contents')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error("Clear resume content error:", error);
    throw new Error(`栞の削除に失敗しました: ${error.message}`);
  }
}

/**
 * 最新の再開地点を取得する
 * 呼び出し側で const data = await getLatestResumeContent<WordResumeMetadata>(); のように利用可能
 */
export async function getLatestResumeContent<T = BaseResumeMetadata>() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('com_t_resume_contents')
    .select(`
      content_id,
      item_id,
      metadata,
      com_m_contents (
        content_name,
        content_type,
        difficulty_level,
        content_label
      )
    `)
    .eq('user_id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // 0件（レコードなし）は正常系として扱う
    console.error("Fetch resume content error:", error);
    return null;
  }

  // 取得したデータを定義したジェネリクス型へアサーション
  return data as unknown as ResumeContentResponse<T>;
}