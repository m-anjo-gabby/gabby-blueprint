---------------------------------------------
-- 【廃止 (2026-09-11)】本関数は decline_session_reschedule_proposals(uuid)
-- （候補単位ではなく、同一キャンセルの候補をまとめて却下する版）に置き換えられた。
-- 正本は function/decline_session_reschedule_proposals.sql を参照。
-- 実際のDROP文は release/20260911_feature-20260911-dev_release.sql にまとめている。
---------------------------------------------
DROP FUNCTION IF EXISTS public.decline_session_reschedule_proposal(uuid);
