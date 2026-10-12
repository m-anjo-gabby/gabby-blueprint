/**
 * 固定アカウント（testing/FIXTURES.md）の投入スクリプトが共通で使う、冪等な作成処理。
 * 状態ペルソナ（features/fixtures/seed-fixed-accounts.ts）と利用者ペルソナ（seed-user-personas.ts）から使う。
 * service_role のクライアントで基盤データ（顧客・ユーザー・契約・ライセンス・アクセス権）だけを作る。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Term } from "./fixture-terms.ts";
import { toUtcAvailabilityRows } from "./coach-availability.ts";

export type PlanCode = "BLUEPRINT_ONLY" | "LIVE_WEEKLY1_3M" | "LIVE_WEEKLY2_3M";

/** com_m_client.client_type（1:法人, 2:個人） */
export type ClientType = 1 | 2;

export interface EnsureUserParams {
  email: string;
  userType: "0" | "1" | "2";
  userName: string;
  clientId: string | null;
  timezone?: string;
}

export interface LicensePeriod {
  startIso: string;
  endIso: string;
  label: string;
}

export function createFixtureKit(admin: SupabaseClient, password: string) {
  async function ensureClient(name: string, clientType: ClientType = 1): Promise<string> {
    const { data: existing } = await admin.from("com_m_client").select("client_id").eq("client_name", name).maybeSingle();
    if (existing) return existing.client_id as string;
    const { data, error } = await admin.from("com_m_client").insert({ client_name: name, client_type: clientType, industry_type: 1 }).select("client_id").single();
    if (error) throw error;
    return data.client_id as string;
  }

  async function findAuthUserByEmail(email: string): Promise<string | undefined> {
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const found = data.users.find((u) => u.email === email);
      if (found) return found.id;
      if (data.users.length < 200) break;
    }
    return undefined;
  }

  async function ensureUser(params: EnsureUserParams): Promise<string> {
    let userId = await findAuthUserByEmail(params.email);
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({ email: params.email, password, email_confirm: true });
      if (error) throw error;
      userId = data.user.id;
    }
    const { error } = await admin
      .from("com_m_user")
      .update({ client_id: params.clientId, user_type: params.userType, user_name: params.userName, ...(params.timezone ? { timezone: params.timezone } : {}) })
      .eq("id", userId);
    if (error) throw error;
    return userId;
  }

  async function ensureRole(userId: string, roleId: string): Promise<void> {
    const { data } = await admin.from("com_t_user_role").select("role_id").eq("user_id", userId).eq("role_id", roleId).maybeSingle();
    if (data) return;
    const { error } = await admin.from("com_t_user_role").insert({ user_id: userId, role_id: roleId });
    if (error) throw error;
  }

  /** コーチプロフィール（生徒の「専属コーチを探す」の対象）。createUserにuser_typeを渡さないため handle_new_user では作られない */
  async function ensureCoachProfile(coachId: string): Promise<void> {
    const { data } = await admin.from("com_m_coach_profile").select("user_id").eq("user_id", coachId).maybeSingle();
    if (data) return;
    const { error } = await admin.from("com_m_coach_profile").insert({ user_id: coachId, coach_since: new Date().toISOString().slice(0, 8) + "01" });
    if (error) throw error;
  }

  /** 週次の対応可能時間帯（未登録のときだけ作る）。days/start/end はコーチの現地時刻で書き、UTC に換算して保存する */
  async function ensureCoachAvailability(coachId: string, timeZone: string, days: number[], start: string, end: string): Promise<void> {
    const { data: existing } = await admin.from("com_m_coach_availability").select("availability_id").eq("coach_id", coachId).limit(1);
    if (existing && existing.length > 0) return;
    const { error } = await admin.from("com_m_coach_availability").insert(toUtcAvailabilityRows(coachId, [{ days, start, end }], timeZone));
    if (error) throw error;
  }

  /** タームごとの契約（noteで識別して冪等にする） */
  async function ensureContract(clientId: string, planCode: PlanCode, term: Term, maxLicenses: number): Promise<string> {
    const note = `【QA固定】${planCode} ${term.label}`;
    const { data: existing } = await admin.from("com_m_contract").select("contract_id").eq("client_id", clientId).eq("note", note).maybeSingle();
    if (existing) return existing.contract_id as string;

    const { data: plan, error: planErr } = await admin.from("com_m_contract_plan").select("*").eq("plan_code", planCode).single();
    if (planErr) throw planErr;
    const { data, error } = await admin
      .from("com_m_contract")
      .insert({
        client_id: clientId,
        plan_id: plan.plan_id,
        plan_name: plan.plan_name,
        contract_name: note,
        plan_name_en: plan.plan_name_en,
        contract_type: plan.contract_type,
        weekly_frequency: plan.weekly_frequency,
        total_sessions: plan.total_sessions,
        has_dialogue_practice: plan.has_dialogue_practice,
        max_licenses: maxLicenses,
        start_date: term.startIso,
        end_date: term.endIso,
        status: 1,
        note,
      })
      .select("contract_id")
      .single();
    if (error) throw error;
    return data.contract_id as string;
  }

  /**
   * 契約に対するユーザーのライセンス（契約×ユーザーで冪等）。期間は既定で契約のターム全体。
   * 戻り値: 作成/既存のlicense_id。期間の重なる別の有効ライセンスがある場合はundefined（スキップ）。
   */
  async function ensureLicense(userId: string, contractId: string, period: LicensePeriod, status: 0 | 1): Promise<string | undefined> {
    const { data: existing } = await admin.from("com_t_user_license").select("license_id").eq("user_id", userId).eq("contract_id", contractId).maybeSingle();
    if (existing) return existing.license_id as string;

    if (status === 1) {
      const { data: overlap } = await admin
        .from("com_t_user_license")
        .select("license_id, start_date, end_date")
        .eq("user_id", userId)
        .eq("status", 1)
        .lte("start_date", period.endIso)
        .gte("end_date", period.startIso)
        .limit(1);
      if (overlap && overlap.length > 0) {
        console.log(`  ⚠ ${period.label}と期間の重なる有効ライセンスが既にあるためスキップ:`, overlap[0]);
        return undefined;
      }
    }

    const { data, error } = await admin
      .from("com_t_user_license")
      .insert({ contract_id: contractId, user_id: userId, status, start_date: period.startIso, end_date: period.endIso, note: "【QA固定】" })
      .select("license_id")
      .single();
    if (error) throw error;
    return data.license_id as string;
  }

  /** ライブ契約のライセンスに対するセッションチケット（ライセンスごとに1件。回数はプランから取る） */
  async function ensureSessionTicket(licenseId: string, contractId: string, userId: string, planCode: PlanCode): Promise<string> {
    const { data: existing } = await admin.from("com_t_user_session_ticket").select("ticket_id").eq("license_id", licenseId).maybeSingle();
    if (existing) return existing.ticket_id as string;
    const { data: plan, error: planErr } = await admin.from("com_m_contract_plan").select("weekly_frequency, total_sessions").eq("plan_code", planCode).single();
    if (planErr) throw planErr;
    const { data, error } = await admin
      .from("com_t_user_session_ticket")
      .insert({ license_id: licenseId, contract_id: contractId, user_id: userId, weekly_frequency: plan.weekly_frequency, total_sessions: plan.total_sessions, used_sessions: 0 })
      .select("ticket_id")
      .single();
    if (error) throw error;
    return data.ticket_id as string;
  }

  /** 顧客に限定公開(1)教材のアクセス権（com_m_contents_access）を付与する（付与済みなら何もしない） */
  async function ensureContentAccess(clientId: string, contentId: string, notes: string): Promise<void> {
    const { data: access } = await admin.from("com_m_contents_access").select("access_id").eq("client_id", clientId).eq("content_id", contentId).eq("delete_flg", "0").maybeSingle();
    if (access) return;
    const { error } = await admin.from("com_m_contents_access").insert({ client_id: clientId, content_id: contentId, notes });
    if (error) throw error;
  }

  /**
   * 汎用スプリント（教材設定 metadata.sprint.sprint_type='0'、例: Gabby NLT）の content_id 一覧。
   * 限定公開(1)のものは指定の顧客にアクセス権を付与する。環境に汎用スプリントが無ければ空配列。
   */
  async function ensureGenericSprintAccess(clientId: string, notes: string): Promise<{ contentId: string; contentName: string }[]> {
    const { data, error } = await admin
      .from("com_m_contents")
      .select("content_id, content_name, content_scope")
      .eq("content_type", 2)
      .eq("delete_flg", "0")
      .in("content_scope", [0, 1])
      .eq("metadata->sprint->>sprint_type", "0")
      .order("content_name");
    if (error) throw error;
    const result: { contentId: string; contentName: string }[] = [];
    for (const content of data ?? []) {
      if (content.content_scope === 1) await ensureContentAccess(clientId, content.content_id as string, notes);
      result.push({ contentId: content.content_id as string, contentName: content.content_name as string });
    }
    return result;
  }

  /** 公開中の最新の必須規約（種別ごと）に同意済みにする。手動でログインしたときに同意画面を挟まないため */
  async function ensureLatestTermsAgreed(userId: string): Promise<void> {
    const { data: terms, error } = await admin
      .from("com_m_terms")
      .select("term_id, term_type, published_date")
      .eq("is_required", true)
      .lte("published_date", new Date().toISOString())
      .order("published_date", { ascending: false });
    if (error) throw error;
    const latestByType = new Map<string, string>();
    for (const t of terms ?? []) {
      if (!latestByType.has(t.term_type as string)) latestByType.set(t.term_type as string, t.term_id as string);
    }
    const rows = [...latestByType.values()].map((termId) => ({ user_id: userId, term_id: termId }));
    if (rows.length === 0) return;
    const { error: upsertErr } = await admin.from("com_t_user_terms_agreement").upsert(rows, { onConflict: "user_id,term_id", ignoreDuplicates: true });
    if (upsertErr) throw upsertErr;
  }

  return {
    ensureClient,
    findAuthUserByEmail,
    ensureUser,
    ensureRole,
    ensureCoachProfile,
    ensureCoachAvailability,
    ensureContract,
    ensureLicense,
    ensureSessionTicket,
    ensureContentAccess,
    ensureGenericSprintAccess,
    ensureLatestTermsAgreed,
  };
}
