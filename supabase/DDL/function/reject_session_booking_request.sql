---------------------------------------------
-- 【廃止 (2026-09-15)】本関数は削除した。
---------------------------------------------
-- decline_session_reschedule_proposals()と統合し、reject_slot_proposal()へ一本化した
-- （com_t_session_slot_proposalへのテーブル統合にあわせたRPC統合）。
-- 正本は function/reject_slot_proposal.sql を参照。
---------------------------------------------
DROP FUNCTION IF EXISTS public.reject_session_booking_request(uuid, text);
