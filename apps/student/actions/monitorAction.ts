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
  user_id: string;
  sprint_type: string;
  content_id: string;
  question_type: string;
  answer_type: string;
  difficulty_level: number;
  time_limit_sec: number;
  total_answered: number;
  insert_date: string;
  com_m_contents?: {
    content_name: string;
  } | null;
  com_m_user: {
    user_name: string | null;
    email?: string;
  };
}

export interface MonitorSprintDrillHistoryItem {
  summary_id: string;
  user_id: string;
  content_id: string;
  training_date: string;
  question_count: number;
  assessment_count: number;
  speed_count: number;
  structure_count: number;
  builders_count: number;
  mastery_count: number;
  com_m_contents?: {
    content_name: string;
  } | null;
  com_m_user: {
    user_name: string | null;
    email?: string;
  };
}

export interface MonitorSprintHistoryResponse {
  sessions: MonitorSprintHistoryItem[];
  drills: MonitorSprintDrillHistoryItem[];
}

/**
 * 現在のクライアントに所属する全ユーザーのリストを取得する (モニター用)
 * @param includeMonitor デモユーザー・モニターを含めるかどうか (デフォルト: false)
 */
export async function getMonitorUserList(includeMonitor: boolean = false): Promise<{ success: boolean; data: MonitorUser[]; error?: string }> {
  const ctx = await getLogContext();
  logger.info("monitor:get_user_list_start", "Fetching monitor user list via RPC", { ...ctx, includeMonitor });

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // 💡 _include_monitor パラメータを渡す
    const { data, error } = await supabase.rpc('get_monitor_user_list', {
      _include_monitor: includeMonitor
    });

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
 */
export async function getMonitorWordHistory(
  startDate: string,
  endDate: string,
  userIds?: string[],
  includeMonitor: boolean = false // 💡 引数を追加
): Promise<{ success: boolean; data: MonitorWordSummaryHistoryItem[]; error?: string }> {
  const ctx = await getLogContext();
  logger.info("monitor:get_word_history_start", "Fetching monitor word history via RPC", { ...ctx, startDate, endDate, userIds, includeMonitor });

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { data, error } = await supabase.rpc('get_monitor_word_history', {
      _start_date: startDate,
      _end_date: endDate,
      _user_ids: userIds && userIds.length > 0 ? userIds : null,
      _include_monitor: includeMonitor // 💡 パラメータを追加
    });

    if (error) throw error;

    const formattedData = (data as any[])?.map(item => ({
      summary_id: item.summary_id,
      content_id: item.content_id,
      user_id: item.user_id,
      training_date: item.training_date,
      word_count: item.word_count,
      phrase_count: item.phrase_count,
      assessment_count: item.assessment_count,
      update_date: item.update_date,
      com_m_contents: {
        content_name: item.content_name
      },
      com_m_user: {
        user_name: item.user_name
      }
    })) || [];

    return { success: true, data: formattedData as MonitorWordSummaryHistoryItem[] };
  } catch (error: any) {
    return { success: false, data: [], error: error.message };
  }
}

/**
 * 特定のユーザーまたは全ユーザーのスプリント履歴およびドリル履歴を取得する (モニター用)
 */
export async function getMonitorSprintHistory(
  startDate: string,
  endDate: string,
  userIds?: string[],
  includeMonitor: boolean = false
): Promise<{ success: boolean; data: MonitorSprintHistoryResponse; error?: string }> {
  const ctx = await getLogContext();
  logger.info("monitor:get_sprint_history_start", "Fetching monitor sprint and drill history via RPC", { ...ctx, startDate, endDate, userIds, includeMonitor });

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // 💡 _user_ids パラメータに渡すために、空配列なら null にする
    const queryUserIds = userIds && userIds.length > 0 ? userIds : null;

    // sessions (TIMESTAMP WITH TIME ZONE) に合わせるため、endDate の末尾に 23:59:59.999Z を付与
    const endTimestamp = `${endDate}T23:59:59.999Z`;

    // 💡 sessions と drills の RPC を並行で呼び出し
    const [sessionsRes, drillsRes] = await Promise.all([
      supabase.rpc('get_monitor_sprint_history', {
        _start_date: startDate,
        _end_date: endTimestamp,
        _user_ids: queryUserIds,
        _include_monitor: includeMonitor
      }),
      supabase.rpc('get_monitor_sprint_drill_history', {
        _start_date: startDate,
        _end_date: endDate,
        _user_ids: queryUserIds,
        _include_monitor: includeMonitor
      })
    ]);

    if (sessionsRes.error) throw sessionsRes.error;
    if (drillsRes.error) throw drillsRes.error;

    const formattedSessions = (sessionsRes.data as any[] || []).map(item => ({
      self_sprint_id: item.self_sprint_id,
      user_id: item.user_id,
      sprint_type: item.sprint_type || '0',
      content_id: item.content_id || '',
      question_type: item.question_type,
      answer_type: item.answer_type,
      difficulty_level: item.difficulty_level,
      time_limit_sec: item.time_limit_sec,
      total_answered: item.total_answered,
      insert_date: item.insert_date,
      com_m_contents: item.content_name ? {
        content_name: item.content_name
      } : null,
      com_m_user: {
        user_name: item.user_name,
        email: item.email || ''
      }
    }));

    const formattedDrills = (drillsRes.data as any[] || []).map(item => ({
      summary_id: item.summary_id,
      user_id: item.user_id,
      content_id: item.content_id,
      training_date: item.training_date,
      question_count: item.question_count,
      assessment_count: item.assessment_count,
      speed_count: item.speed_count,
      structure_count: item.structure_count,
      builders_count: item.builders_count,
      mastery_count: item.mastery_count,
      com_m_contents: item.content_name ? {
        content_name: item.content_name
      } : null,
      com_m_user: {
        user_name: item.user_name,
        email: item.email || ''
      }
    }));

    logger.info("monitor:get_sprint_history_success", `Fetched ${formattedSessions.length} sessions, ${formattedDrills.length} drills`, ctx);

    return { 
      success: true, 
      data: {
        sessions: formattedSessions as MonitorSprintHistoryItem[],
        drills: formattedDrills as MonitorSprintDrillHistoryItem[]
      }
    };
  } catch (error: any) {
    logger.error("monitor:get_sprint_history_error", "Error in getMonitorSprintHistory via RPC", {
      ...ctx,
      payload: { error: error.message, stack: error.stack }
    });
    return { 
      success: false, 
      data: { sessions: [], drills: [] }, 
      error: error.message 
    };
  }
}