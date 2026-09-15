---------------------------------------------
-- 月次コーチングレポート: 対象月セッション一覧RPC (2026-09-13 追加)
-- 前提: table/com_t_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 月次コーチングレポートのグリッド描画・要注意セル判定・詳細モーダル表示の唯一のデータ源。
-- カウント規則(counts_toward_total)・注意色判定(is_unresolved/is_attention)は、このRPCが
-- 単一の実装箇所となる（呼び出し側TypeScript・承認RPCのいずれもここで計算済みの値をそのまま使う）。
--
-- 【カウント規則】
-- completed(status=2、内訳(completion_result)問わず) / 生徒都合12h以内キャンセル
-- (status=3かつcancel_category=1(student)かつticket_refunded=false) をコーチの
-- 稼働実績としてカウントする。コーチキャンセル(cancel_category=2)・生徒都合12h以上前
-- キャンセル(ticket_refunded=true)・アドミン代理キャンセル(cancel_category=3)・
-- ライセンス無効化(cancel_category=4)・コーチ交代(cancel_category=5)はカウントしない。
--
-- 【注意色】
-- is_unresolved: 終了処理が行われていない枠（status=1かつ終了予定時刻を過ぎている）
-- is_attention: 12h以内キャンセル・No show・早期終了を含む枠（is_unresolvedとは別の注意色）
--
-- 【ステータス簡素化 (2026-09-14変更)】
-- 旧status値(6,7,8,9,10)を撤廃しstatus=2(completed)/3(cancelled)に統合したことに伴い、
-- completion_result/cancel_categoryを新設の出力列として追加する（呼び出し側TypeScriptが
-- No Show/Early Ended等の内訳ラベルを表示するために必要。table/com_t_session.sqlの
-- ステータス簡素化パッチ参照）。RETURNS TABLEの列追加のため、CREATE OR REPLACEの前に
-- DROP FUNCTIONで旧シグネチャを明示的に削除する。
--
-- 【対象行の絞り込み (2026-09-13 追加、同日中に一般化)】
-- 本レポートは「今月のコーチ稼働実績」を見る画面であり、実績・要対応のいずれでもない行
-- （例: 12h以上前の通常キャンセル(ticket_refunded=true)・コーチキャンセル・アドミン代理
-- キャンセル・振替済みの旧セッション・ライセンス無効化/コーチ交代による自動キャンセル・
-- まだ終了予定時刻を過ぎていない通常の予定）は、counts_toward_total/is_attentionには
-- 元々影響しないものの、一覧に件数として表示されると「実施していない/対象外のはずの日に
-- 数字が出ている」ように見え紛らわしい（実コーチアカウントでの確認により判明）。
-- そのため、返却対象は「counts_toward_total=true（実績としてカウントする） または
-- is_unresolved=true（終了処理未実施、要対応）」の行のみに絞り込む。
-- is_attention=trueの行は必ずcounts_toward_total=trueの部分集合であるため、この条件のみで
-- 完了・12h以内キャンセル・No show（＝要対応）・終了処理未実施のいずれも含まれる。
--
-- 【月範囲判定 (2026-09-13 コーチのタイムゾーン基準に修正)】
-- 「当月の稼働実績」を測る指標であるため、月の境界はUTCではなくコーチ自身の暦日
-- (com_m_user.timezone)を基準に判定する。タイムゾーンはクライアントからパラメータで
-- 受け取らず、本関数が呼び出しの都度com_m_userから直接参照する。呼び出し側が任意の値を
-- 詐称して境界を操作することを防ぎ、境界の変動は「実際にプロフィールのタイムゾーンを
-- 変更した場合」のみに限定するため。承認済み月はcom_t_coach_monthly_report_approval.
-- session_count_snapshotに固定保存されるため、承認後のタイムゾーン変更は既に承認済みの
-- 集計を遡って変えない（影響があるとしても未承認の月の月境界付近のみ）。
--
-- 【権限チェックの共通化 (2026-09-15追加)】
-- fn_assert_actor_or_admin()を使う（前提: function/fn_assert_actor_or_admin.sql）。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_coach_monthly_sessions(uuid, date);

CREATE OR REPLACE FUNCTION public.get_coach_monthly_sessions(p_coach_id uuid, p_report_month date)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    completion_result smallint,
    cancel_category smallint,
    status_note text,
    ticket_refunded boolean,
    counts_toward_total boolean,
    is_unresolved boolean,
    is_attention boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_timezone text;
    v_month_start_utc timestamptz;
    v_month_end_utc timestamptz;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(p_coach_id, 'not authorized to view this coach''s monthly report');

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo'; -- 対象コーチが存在しない場合のフォールバック（結果は0件になる）
    END IF;

    v_month_start_utc := date_trunc('month', p_report_month::timestamp) AT TIME ZONE v_coach_timezone;
    v_month_end_utc := (date_trunc('month', p_report_month::timestamp) + interval '1 month') AT TIME ZONE v_coach_timezone;

    RETURN QUERY
    SELECT
        s.session_id,
        s.student_id,
        s.start_datetime,
        s.end_datetime,
        s.status,
        s.completion_result,
        s.cancel_category,
        s.status_note,
        s.ticket_refunded,
        (s.status = 2 OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) AS counts_toward_total,
        (s.status = 1 AND s.end_datetime < NOW()) AS is_unresolved,
        ((s.status = 2 AND s.completion_result IN (2, 3)) OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) AS is_attention
    FROM public.com_t_session s
    WHERE s.coach_id = p_coach_id
      AND s.start_datetime >= v_month_start_utc
      AND s.start_datetime < v_month_end_utc
      AND (
          (s.status = 2 OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) -- counts_toward_total
          OR (s.status = 1 AND s.end_datetime < NOW()) -- is_unresolved
      )
    ORDER BY s.student_id, s.start_datetime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) TO authenticated;
