"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { createLogger, getLogContext } from "@gabby/lib/logger";
import { WordSummaryHistoryItem } from "./wordAction"; // Re-use type

const logger = createLogger('monitor');

// Type for a user from vw_user_list
export interface MonitorUser {
  id: string; // auth.users UUID or invitation ID
  user_id: number | null; // com_m_user BIGSERIAL, null for invited users
  user_name: string | null;
  user_type: string;
  client_id: string | null;
  client_name: string | null;
  email: string;
  last_sign_in_at: string | null; // ISO string
  confirmed_at: string | null; // ISO string
  roles: string[] | null;
  license_id: string | null;
  license_status: number | null;
  license_start_date: string | null;
  license_end_date: string | null;
  plan_name: string | null;
  mail_sent_at: string | null;
  last_mail_error: string | null;
  license_state: 'none' | 'future' | 'expired' | 'active' | 'mail_failed' | 'expired_invite' | 'inviting';
  insert_date: string; // ISO string
}

export interface MonitorWordSummaryHistoryItem extends WordSummaryHistoryItem {
  user_id: string;
  com_m_user: {
    user_name: string | null;
    email?: string;
  };
}

// Define the structure for Sprint History items returned by the monitor action
export interface MonitorSprintHistoryItem {
  self_sprint_id: string;
  question_type: string;
  answer_type: string;
  difficulty_level: number;
  time_limit_sec: number;
  total_answered: number;
  insert_date: string;
  com_m_user: {
    user_name: string | null;
    email?: string;
  };
}

/**
 * 現在のクライアントに所属する全ユーザー（本登録済みおよび招待中）のリストを取得する
 */
export async function getMonitorUserList(): Promise<{ success: boolean; data: MonitorUser[]; error?: string }> {
  const ctx = await getLogContext();
  logger.info("monitor:get_user_list_start", "Fetching monitor user list", ctx);

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Call the RPC function to get the client's user list
    // This RPC function runs with SECURITY DEFINER and filters by the current user's client_id.
    const { data, error } = await supabase.rpc('get_client_user_list');

    if (error) throw error;

    logger.info("monitor:get_user_list_success", `Fetched ${data?.length || 0} users`, ctx);
    return { success: true, data: data || [] };

  } catch (error: any) {
    logger.error("monitor:get_user_list_error", "Failed to fetch monitor user list", {
      ...ctx,
      payload: { error: error.message }
    });
    return { success: false, data: [], error: error.message };
  }
}

/**
 * 特定のユーザーまたは全ユーザーの単語ドリル履歴を取得する (モニター用)
 * @param startDate 開始日 (ISO string)
 * @param endDate 終了日 (ISO string)
 * @param userIds フィルタリングするユーザーIDの配列 (オプション)
 */
export async function getMonitorWordHistory(
  startDate: string,
  endDate: string,
  userIds?: string[]
): Promise<{ success: boolean; data: MonitorWordSummaryHistoryItem[]; error?: string }> {
  const ctx = await getLogContext();
  logger.info("monitor:get_word_history_start", "Fetching monitor word history", { ...ctx, startDate, endDate, userIds });

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    let query = supabase
      .from("self_t_word_summary")
      .select(`
        summary_id,
        content_id,
        user_id,
        training_date,
        word_count,
        phrase_count,
        assessment_count,
        update_date,
        com_m_contents (
          content_name
        ),
        com_m_user (
          user_name
        )
      `)
      .gte("training_date", startDate)
      .lte("training_date", endDate)
      .order("training_date", { ascending: false });

    // Filter by user IDs if provided
    if (userIds && userIds.length > 0) {
      query = query.in("user_id", userIds);
    } else {
      // If no specific userIds are provided, RLS "Managers can view client's word summaries"
      // will automatically filter for users within the monitor's client.
    }

    const { data, error } = await query;

    if (error) throw error;

    const formattedData = (data as any[])?.map(item => ({
      ...item,
      com_m_contents: Array.isArray(item.com_m_contents) ? item.com_m_contents[0] : item.com_m_contents,
      com_m_user: Array.isArray(item.com_m_user) ? item.com_m_user[0] : item.com_m_user
    })) || [];

    logger.info("monitor:get_word_history_success", `Fetched ${formattedData.length} word history items`, {
      ...ctx,
      count: formattedData.length
    });

    return { success: true, data: formattedData as MonitorWordSummaryHistoryItem[] };

  } catch (error: any) {
    logger.error("monitor:get_word_history_error", "Failed to fetch monitor word history", {
      ...ctx,
      payload: { error: error.message }
    });
    return { success: false, data: [], error: error.message };
  }
}

/**
 * 特定のユーザーまたは全ユーザーのスプリント履歴を取得する (モニター用)
 * @param startDate 開始日 (ISO string)
 * @param endDate 終了日 (ISO string)
 * @param userIds フィルタリングするユーザーIDの配列 (オプション)
 */
export async function getMonitorSprintHistory(
  startDate: string,
  endDate: string,
  userIds?: string[]
): Promise<{ success: boolean; data: MonitorSprintHistoryItem[]; error?: string }> {
  const ctx = await getLogContext();
  logger.info("monitor:get_sprint_history_start", "Fetching monitor sprint history", { ...ctx, startDate, endDate, userIds });

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    let query = supabase
      .from("self_t_sprint")
      .select(`
        self_sprint_id,
        question_type,
        answer_type,
        difficulty_level,
        time_limit_sec,
        total_answered,
        insert_date,
        com_m_user (
          user_name
        )
      `)
      .gte("insert_date", startDate)
      .lte("insert_date", `${endDate}T23:59:59.999Z`)
      .order("insert_date", { ascending: false });

    // Filter by user IDs if provided
    if (userIds && userIds.length > 0) {
      query = query.in("user_id", userIds);
    } else {
      // RLS "Managers can view client's sprint scores" will handle client-level filtering
    }

    const { data, error } = await query;

    if (error) throw error;

    const formattedData = (data as any[])?.map(item => ({
      ...item,
      com_m_user: Array.isArray(item.com_m_user) ? item.com_m_user[0] : item.com_m_user
    })) || [];

    logger.info("monitor:get_sprint_history_success", `Fetched ${formattedData.length} sprint history items`, {
      ...ctx,
      count: formattedData.length
    });

    return { success: true, data: formattedData as MonitorSprintHistoryItem[] };

  } catch (error: any) {
    logger.error("monitor:get_sprint_history_error", "Failed to fetch monitor sprint history", {
      ...ctx,
      payload: { error: error.message }
    });
    return { success: false, data: [], error: error.message };
  }
}