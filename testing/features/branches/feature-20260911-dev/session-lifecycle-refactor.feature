# 対象ブランチ: feature/20260911-dev
# 目的: 本セッションで実装した以下2件のリファクタのデータ主体テスト。
#   1. com_m_lesson_schedule.target_sessions（コマ別セッション目標数の均等割り・生成上限・
#      マッチング遅延によるエンタイトルメント不足の可視化）
#   2. com_t_session.status簡素化（scheduled/completed/cancelledの3値化 + completion_result/
#      cancel_categoryへの分離）
# 関連実装: supabase/DDL/table/{com_m_lesson_schedule,com_t_session}.sql
#          supabase/DDL/function/{approve_matching_request,admin_match_student_with_coach,
#          fn_generate_sessions_for_schedule,fn_schedule_shortfall,finalize_session,
#          resolve_stale_session,cancel_session,admin_book_session_direct,
#          release_lesson_schedule_slot,invalidate_user_license,get_coach_monthly_sessions}.sql
#          admin_reschedule_sessionは2026-09-15に廃止（アドミンの日時変更もcancel_session+
#          admin_book_session_directの「キャンセル＋予約」の2操作に統一）。
# 備考: admin_match_student_with_coachは生成起点日をGREATEST(license_start, CURRENT_DATE)に
#      クランプするため、過去日付のセッションは生成できない(KJ-2026-0910-01)。本シナリオでも
#      「過去の完了実績」はservice_role直接INSERT(status=1)+resolve_stale_session RPCの
#      ハイブリッド方式で再現している。テストデータは検証完了後に削除する運用とする
#      （-cleanup.tsを参照。ユーザーからの明示指示による）。

Feature: セッションライフサイクル刷新（target_sessions / status簡素化） データ主体テスト（feature/20260911-dev）

  Background:
    Given 顧客「【QAテスト】セッションライフサイクル刷新検証」とQAコーチが存在する
    And 代理操作用アドミン "qa-admin@gabby-qa-test.example" でサインインできる
    And 全QAアカウントは環境変数 QA_LIVE_SESSION_TEST_PASSWORD に設定された共通パスワードでサインインできる

  Scenario: target_sessionsは契約の総セッション数を週回数で均等割りし、余りはslot_no昇順に配分する
    Given QA生徒SAのチケットが週3回・総セッション数25に設定されている
    When アドミンのJWTでadmin_match_student_with_coachを3コマ分(slot_no=1,2,3)呼び出す
    Then 各スケジュールのtarget_sessionsは 1コマ目=9, 2コマ目=8, 3コマ目=8 になること

  Scenario: セッション生成はtarget_sessionsに達したら、ライセンス期間がまだ残っていても打ち切られる
    Given QA生徒SAのライセンス期間は335日先まで残っている(週1回あたり50回以上入る余地がある)
    Then 各スケジュールで実際に生成されたcom_t_session(status=1)の件数はtarget_sessionsと完全に一致すること
    And fn_schedule_shortfallはいずれもexpected=actual=target_sessions, shortfall=0を返すこと

  Scenario: マッチングが契約開始から遅れて残り期間が短い場合、target_sessionsは変わらずshortfallとして不足が可視化される
    Given QA生徒SBは週2回・総セッション数24の契約だが、ライセンス開始日は80日前、終了日はあと10日しかない
    When アドミンのJWTでadmin_match_student_with_coachを1コマ分呼び出す
    Then target_sessionsは契約上の目標である12のままであること(マッチングタイミングの影響を受けない)
    And 実際に生成される件数は残りわずかな期間の分(2件)のみであること
    And fn_schedule_shortfallはexpected=12, actual=2, shortfall=10を返し、不足が正しく検知されること
        (旧実装では期待値自体が暦週計算で2に縮んでしまい、この不足を検知できなかった)

  Scenario: finalize_sessionはstatusを常にcompletedへ確定し、正常終了/早期終了/no_showはcompletion_resultで区別する
    Given QA生徒SCに、call_logの重複時間が異なる3件の予定セッション(30分/10分/コーチのみ入室)がある
    When コーチのJWTでfinalize_sessionを、重複30分のセッションに対して理由なしで呼び出す
    Then status=2(completed), completion_result=1(normal)になること
    When コーチのJWTでfinalize_sessionを、重複10分のセッションに対して理由なしで呼び出す
    Then reason_required相当のエラーになること
    When 理由を付けて再度呼び出す
    Then completion_result=2(early_ended)になり、status_noteに理由が記録されること
    When コーチのJWTでfinalize_sessionを、生徒の入室記録が無いセッションに対して呼び出す
    Then completion_result=3(no_show)になること
    And used_sessionsが加算されるのはcompletion_result=1(normal)の場合のみであること

  Scenario: resolve_stale_sessionは新パラメータp_completion_result(1/2/3)でstatusを常にcompletedへ確定する
    Given QA生徒SCに、終了予定時刻を過ぎてもscheduledのままの過去セッションが2件、service_role直接投入されている
    When コーチのJWTでresolve_stale_sessionを理由未指定で呼び出す
    Then エラーになること
    When completion_result=1(normal)・理由付きで呼び出す
    Then status=2, completion_result=1になり、status_noteに理由が記録され、used_sessionsが加算されること
        (resolve_stale_sessionは内訳によらず常に理由をstatus_noteへ記録する)
    When 別の1件をcompletion_result=2(early_ended)・理由付きで呼び出す
    Then status=2, completion_result=2になり、used_sessionsは加算されないこと

  Scenario: get_coach_monthly_sessionsのcompletion_result/counts_toward_total/is_attentionが内訳ごとに正しい
    Then normal完了は counts_toward_total=true, is_attention=false であること
    And early_ended/no_showは counts_toward_total=true, is_attention=true (要対応)であること

  Scenario: cancel_sessionはstatusを常にcancelledへ確定し、起因(cancel_category)は生徒/コーチ/アドミン代理で区別する
    Given QA生徒SDに予定セッションが複数件ある
    When 生徒本人のJWTで開始12時間以上前のセッションをキャンセルする
    Then cancel_category=1(student), ticket_refunded=trueになること
    When 生徒本人のJWTで開始12時間未満のセッションをキャンセルする
    Then cancel_category=1(student), ticket_refunded=false(返還なし)になること
    When コーチのJWTで別のセッションをキャンセルする
    Then cancel_category=2(coach), ticket_refunded=true(時間帯を問わず常に返還)になること
    When アドミンのJWTでp_admin_refund_ticket=true/falseを明示指定してそれぞれキャンセルする
    Then いずれもcancel_category=3(admin)になり、ticket_refundedは明示指定どおりの値になること

  Scenario: アドミンの日時変更は「キャンセル＋予約」の2操作に統一されている(admin_reschedule_session廃止)
    Given QA生徒SDに予定セッションがある
    When アドミンのJWTでcancel_session(p_as_admin=true, 返還あり)を呼び出す
    Then 旧セッションはstatus=3(cancelled), cancel_category=3(admin)になること
    When 続けてアドミンのJWTで同一スケジュール枠へadmin_book_session_directを新しい日時で呼び出す
    Then 新セッションはstatus=1(scheduled)で、同一スケジュール枠に作成されること

  Scenario: 複数のキャンセル種別が混在してもfn_schedule_shortfallの集計式(status/ticket_refundedベース)が独立検証と一致する
    Then fn_schedule_shortfallのactual値は、TS側で独立に再現した集計(status IN(scheduled,completed)
        OR (status=cancelled AND ticket_refunded=false))と完全に一致すること

  Scenario: release_lesson_schedule_slot(コーチ交代)は未実施の予定セッションをcancel_category=coach_reassignedにする
    Given QA生徒SEに現役の専属コーチ枠と、複数の予定セッションがある
    When アドミンのJWTでrelease_lesson_schedule_slotを呼び出す
    Then スケジュールはstatus=9(terminated)になること
    And 未実施だった予定セッション全てがstatus=3(cancelled), cancel_category=5(coach_reassigned)になること
    And これらのセッションのticket_refundedはNULLのまま(明示的に返還フラグを立てない)であること

  Scenario: invalidate_user_license(ライセンス無効化)は未実施の予定セッションをcancel_category=license_endedにする
    Given QA生徒SFに現役ライセンスと、複数の予定セッションがある
    When アドミンのJWTでinvalidate_user_licenseを呼び出す
    Then ライセンスはstatus=0(停止)になり、紐づくスケジュールはstatus=9(terminated)になること
    And 未実施だった予定セッション全てがstatus=3(cancelled), cancel_category=4(license_ended)になること
