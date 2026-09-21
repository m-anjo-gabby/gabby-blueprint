---------------------------------------------
-- 【廃止 (2026-09-15)】本関数は削除した。
---------------------------------------------
-- approve_session_booking_request()と統合し、approve_slot_proposal()へ一本化した
-- （com_t_session_slot_proposalへのテーブル統合にあわせたRPC統合）。
-- 正本は function/approve_slot_proposal.sql を参照。
---------------------------------------------
DROP FUNCTION IF EXISTS public.accept_session_reschedule_proposal(uuid);
