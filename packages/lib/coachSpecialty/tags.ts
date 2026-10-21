import { type CoachSpecialtyMaster, type CoachSpecialtyTag } from '@gabby/types/coachSpecialty';

/**
 * コーチに設定された専門コードを、マスタの表示順の表示用タグにする。
 * マスタに無い（論理削除された）コードは表示しない。名称は各ポータルの言語（student: ja / coach: en）で選ぶ。
 */
export function toCoachSpecialtyTags(
  codes: readonly string[],
  master: readonly CoachSpecialtyMaster[],
  lang: 'ja' | 'en',
): CoachSpecialtyTag[] {
  const codeSet = new Set(codes);
  return master
    .filter((s) => codeSet.has(s.specialty_code))
    .map((s) => ({ code: s.specialty_code, kind: s.kind, label: lang === 'ja' ? s.name_ja : s.name_en }));
}

/**
 * 専門での絞り込みの判定。分野（kind='field'）は選んだもののどれかに当てはまればよく、
 * 得意分野（kind='skill'。発音プロ）は選んだものを全て持つコーチだけを残す（分野と組み合わせると「かつ」になる）。
 * 何も選んでいない場合は全員が当てはまる。
 */
export function matchesCoachSpecialtyFilter(
  coachCodes: readonly string[],
  selectedCodes: ReadonlySet<string>,
  master: readonly CoachSpecialtyMaster[],
): boolean {
  if (selectedCodes.size === 0) return true;
  const owned = new Set(coachCodes);
  const selected = master.filter((s) => selectedCodes.has(s.specialty_code));
  const fields = selected.filter((s) => s.kind === 'field');
  const skills = selected.filter((s) => s.kind === 'skill');
  if (fields.length > 0 && !fields.some((s) => owned.has(s.specialty_code))) return false;
  return skills.every((s) => owned.has(s.specialty_code));
}
