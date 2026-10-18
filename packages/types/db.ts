/**
 * アプリが使う DB の型（Supabase のクライアントに渡す Database）。
 *
 * - 元は実DBから生成した database.ts（supabase/release/types.mjs。区分値の列は CHECK 制約の値の型になっている）。
 * - 生成では分からない列の型だけを、ここで上書きする（JSON の列の中身・pgvector の列・ビューの列の null 有無・RPC の戻り値）。
 *   上書きは「DB の実際の形」を書く場所で、画面の都合の型（表示用に組み立てた型等）は書かない。
 * - 行の型は TableRow<'com_t_session'> 等で参照する（画面ごとに行の型を手で書き直さない）。
 */
import type { Database as GeneratedDatabase, Json } from './database';
import type { CalendarEventMessageAttachment, CalendarEventType } from './calendarEvent';
import type { AdminCoachRatingsRpcResult } from './coachRating';
import type { DayOfWeek } from './coachAvailability';
import type { ContentMetadata } from './content';
import type { PurgeClientResult, WithdrawUserResult } from './dataDeletion';
import type { MonitorSprintDrillHistoryRow, MonitorSprintHistoryRow, MonitorWordHistoryRow } from './monitor';
import type { NoticeAttachment } from './notice';
import type { SessionOutcome } from './session';
import type { ResumeMetadata, UserTrainingPerformanceResponse } from './training';
import type { TrainingReportData } from './trainingReport';
import type { LicenseState, UserType } from './user';
import type { TTSAdjustmentData, TTSAssetAdjustments } from './word';

export type { Json };

type Generated = GeneratedDatabase;
type SchemaName = Exclude<keyof Generated, '__InternalSupabase'>;

// 上書きの仕組み

/** T の列 K の型を C[K] に差し替える（optional の印は T のまま） */
type ReplaceColumns<T, C> = { [K in keyof T]: K extends keyof C ? C[K] : T[K] };

/** C のキーがすべて Row の列にあるか（無い列名を書いたら never になり、その表を使う箇所で型エラーになる） */
type KnownColumns<Row, C> = Exclude<keyof C, keyof Row> extends never ? C : never;

type OverrideRelation<R extends { Row: object }, C> = {
  [P in keyof R]: P extends 'Row' | 'Insert' | 'Update' ? ReplaceColumns<R[P], KnownColumns<R['Row'], C>> : R[P];
};

type OverrideRelations<Relations, Overrides> = {
  [N in keyof Relations]: N extends keyof Overrides
    ? Relations[N] extends { Row: object }
      ? OverrideRelation<Relations[N], Overrides[N]>
      : Relations[N]
    : Relations[N];
};

type OverrideFunctions<Functions, Overrides> = {
  [N in keyof Functions]: N extends keyof Overrides
    ? Omit<Functions[N], keyof Overrides[N]> & Overrides[N]
    : Functions[N];
};

type OverrideSchema<S, O extends SchemaOverrides> = Omit<S, 'Tables' | 'Views' | 'Functions'> & {
  Tables: OverrideRelations<S[keyof S & 'Tables'], O['Tables']>;
  Views: OverrideRelations<S[keyof S & 'Views'], O['Views']>;
  Functions: OverrideFunctions<S[keyof S & 'Functions'], O['Functions']>;
};

interface SchemaOverrides {
  Tables: object;
  Views: object;
  Functions: object;
}

// 上書きする列（スキーマ → 表・ビュー・関数 → 列）

type GeneratedRow<T extends keyof Generated['public']['Tables']> = Generated['public']['Tables'][T]['Row'];
type GeneratedReturnRow<F extends keyof Generated['public']['Functions']> =
  Generated['public']['Functions'][F] extends { Returns: (infer R)[] } ? R : never;

interface PublicOverrides extends SchemaOverrides {
  Tables: {
    // 範囲の CHECK（1〜5・0〜6）で、生成では区分値にならない
    com_t_session_outcome_history: { outcome: SessionOutcome };
    com_m_coach_availability: { day_of_week: DayOfWeek };
    com_m_lesson_schedule: { day_of_week: DayOfWeek };
    com_t_matching_request: { requested_day_of_week: DayOfWeek };
    // 値が増える前提で CHECK 制約を付けていない区分値（正本はアプリの型。DDL のコメントに明記）
    com_m_calendar_event: { event_type: CalendarEventType };

    // JSON の列の中身
    // TTS の調整（声・速さと単語ごとの強調・間）。管理画面の TTS の作成ダイアログが保存する
    com_m_color_vowel_dictionary: { tts_adjustments: TTSAdjustmentData | null };
    com_m_phrase: { tts_adjustments: TTSAdjustmentData | null };
    com_m_sprint_questions: {
      statement_tts_adjustments: TTSAdjustmentData | null;
      question_tts_adjustments: TTSAdjustmentData | null;
      answer_sentence_yes_tts_adjustments: TTSAdjustmentData | null;
      answer_sentence_no_tts_adjustments: TTSAdjustmentData | null;
    };
    com_t_tts_asset: { tts_adjustments: TTSAssetAdjustments | null };
    com_m_ai_knowledge_base: { metadata: Record<string, unknown> };
    com_m_contents: { metadata: ContentMetadata };
    com_m_notice: { attachments: NoticeAttachment[] };
    com_t_calendar_event_message: { attachments: CalendarEventMessageAttachment[] };
    com_t_resume_contents: { metadata: ResumeMetadata };
    // 解答履歴は CHECK 制約で配列であることだけを保証する。要素は読む側で検証する（packages/lib/sprint/answeredHistory.ts）
    lesson_t_sprint: { answered_history: unknown[] };
    self_t_sprint: { answered_history: unknown[] };
  };
  // ビューの列は生成では全て null を含むため、元の表で NOT NULL の列（内部結合・COALESCE 済みの列）を書く
  Views: {
    vw_contract_details: {
      client_id: string;
      client_name: string;
      contract_id: string;
      contract_name: string;
      contract_type: GeneratedRow<'com_m_contract'>['contract_type'];
      current_active_count: number;
      current_assigned_count: number;
      end_date: string;
      has_dialogue_practice: boolean;
      max_licenses: number;
      plan_id: string;
      plan_name: string;
      plan_name_en: string;
      remaining_licenses: number;
      start_date: string;
      status: GeneratedRow<'com_m_contract'>['status'];
    };
  };
  // jsonb を返す RPC の中身
  Functions: {
    admin_get_coach_ratings: { Returns: AdminCoachRatingsRpcResult | null };
    fn_purge_client: { Returns: PurgeClientResult };
    get_monitor_sprint_drill_history: { Returns: MonitorSprintDrillHistoryRow[] };
    get_monitor_sprint_history: { Returns: MonitorSprintHistoryRow[] };
    get_monitor_word_history: { Returns: MonitorWordHistoryRow[] };
    get_monitor_user_list: {
      Returns: ReplaceColumns<GeneratedReturnRow<'get_monitor_user_list'>, { license_state: LicenseState }>[];
    };
    get_training_report_data: { Returns: TrainingReportData[] | null };
    get_user_training_performance: { Returns: UserTrainingPerformanceResponse | null };
    fn_withdraw_user: { Returns: WithdrawUserResult | null };
  };
}

interface PrivateOverrides extends SchemaOverrides {
  Tables: object;
  Views: {
    vw_user_list: {
      /** 本登録済みは auth.users の UUID、招待中は招待の UUID */
      id: string;
      insert_date: string;
      user_type: UserType | null;
      /** 招待中は NULL */
      user_status: GeneratedRow<'com_m_user'>['status'] | null;
      license_status: GeneratedRow<'com_t_user_license'>['status'] | null;
      license_state: LicenseState;
    };
  };
  Functions: object;
}

// 公開する型

export type Database = Omit<Generated, 'public' | 'private'> & {
  public: OverrideSchema<Generated['public'], PublicOverrides>;
  private: OverrideSchema<Generated['private'], PrivateOverrides>;
};

type PublicSchema = Database['public'];

/** 表の1行（select の結果） */
export type TableRow<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
/** 表への追加（insert の値） */
export type TableInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
/** 表の更新（update の値） */
export type TableUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
/** ビューの1行 */
export type ViewRow<
  V extends keyof PublicSchema['Views'],
  S extends SchemaName = 'public',
> = V extends keyof Database[S]['Views'] ? (Database[S]['Views'][V] extends { Row: infer R } ? R : never) : never;
/** RPC の戻り値 */
export type FunctionReturns<F extends keyof PublicSchema['Functions']> = PublicSchema['Functions'][F] extends {
  Returns: infer R;
}
  ? R
  : never;
