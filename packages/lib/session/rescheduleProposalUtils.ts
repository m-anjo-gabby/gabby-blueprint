import { SessionRescheduleProposal, SessionRescheduleProposalGroup } from '@gabby/types/session';

/**
 * 振替候補の一覧(SessionRescheduleProposal[])を、同一セッション(=同一キャンセル)単位で
 * グルーピングする。UI側は「1つの提案=最大3候補、一括却下」という単位で表示するため、
 * ライブセッションハブ（生徒）・申請一覧（コーチ）の両方でこの単位に変換してから使う。
 *
 * 純粋関数のため、'use server'指定のある actions/sessionActions.ts とは別ファイルに置く
 * （'use server'ファイル内のexportはNext.jsによりServer Action=async関数であることを
 * 要求されるため、同期関数をここに置くとビルドエラーになる）。
 */
export function groupRescheduleProposals(proposals: SessionRescheduleProposal[]): SessionRescheduleProposalGroup[] {
  const groups = new Map<string, SessionRescheduleProposalGroup>();
  for (const p of proposals) {
    const existing = groups.get(p.session_id);
    if (existing) {
      existing.candidates.push(p);
      if (p.insert_date < existing.insert_date) existing.insert_date = p.insert_date;
    } else {
      groups.set(p.session_id, {
        session_id: p.session_id,
        coach_id: p.coach_id,
        student_id: p.student_id,
        proposed_by_role: p.proposed_by_role,
        insert_date: p.insert_date,
        candidates: [p],
      });
    }
  }
  return Array.from(groups.values());
}
