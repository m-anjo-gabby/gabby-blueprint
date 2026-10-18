/**
 * テスト用コーチを生徒の「専属コーチを探す」に出せる状態にする（2026-10-11 追加）。
 * 一覧に出るのは、アイコン・プロフィールの必須6項目・空き時間がそろったコーチだけ
 * （supabase/DDL/function/fn_coach_matching_missing_items.sql）。空き時間は呼び出し側で登録する。
 * 固定アカウント（fixture-accounts.ts）と E2E の使い捨てのコーチ（e2e/support/authFixtures.ts）から使う。
 */
import { deflateSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';

/** テスト用コーチで共有するアイコン（profile バケット。同じパスへ上書きで置く） */
const QA_COACH_ICON_PATH = 'profile/qa-fixtures/coach-icon.png';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** 単色の正方形の PNG（ブランド色 #0e3196） */
function solidPng(size: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // ビット深度
  header[9] = 2; // RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: size }, () => [0x0e, 0x31, 0x96]).flat()),
  ]);
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

let iconUploaded: Promise<void> | null = null;

function ensureQaCoachIcon(admin: SupabaseClient): Promise<void> {
  iconUploaded ??= (async () => {
    const { error } = await admin.storage
      .from('profile')
      .upload(QA_COACH_ICON_PATH, solidPng(64), { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`テスト用コーチのアイコンの登録に失敗しました: ${error.message}`);
  })();
  return iconUploaded;
}

export interface CoachMatchingProfileParams {
  /** com_m_country.country_code（例: "US" / "CA" / "JP"） */
  countryCode: string;
  teachingYears?: number;
}

/**
 * アイコンとプロフィールの必須6項目のうち、未設定のものだけを埋める（設定済みの値は変えない。何度実行しても安全）。
 */
export async function fillCoachMatchingProfile(
  admin: SupabaseClient,
  coachId: string,
  params: CoachMatchingProfileParams,
): Promise<void> {
  const [{ data: user, error: userError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from('com_m_user').select('icon_path').eq('id', coachId).single(),
    admin
      .from('com_m_coach_profile')
      .select('country_code, teaching_years, education, qualifications, job_experience, introduction')
      .eq('user_id', coachId)
      .single(),
  ]);
  if (userError) throw userError;
  if (profileError) throw profileError;

  if (!user.icon_path) {
    await ensureQaCoachIcon(admin);
    const { error } = await admin.from('com_m_user').update({ icon_path: QA_COACH_ICON_PATH }).eq('id', coachId);
    if (error) throw error;
  }

  const blank = (value: string | null) => !value?.trim();
  const patch = {
    ...(profile.country_code ? {} : { country_code: params.countryCode }),
    ...(profile.teaching_years !== null ? {} : { teaching_years: params.teachingYears ?? 5 }),
    ...(blank(profile.education) ? { education: 'Bachelor of Arts in English (QA test data)' } : {}),
    ...(blank(profile.qualifications) ? { qualifications: 'TESOL Certificate (QA test data)' } : {}),
    ...(blank(profile.job_experience) ? { job_experience: 'Business English coaching (QA test data)' } : {}),
    ...(blank(profile.introduction) ? { introduction: 'Hello! This is a QA test coach profile.' } : {}),
  };
  if (Object.keys(patch).length === 0) return;
  const { error } = await admin.from('com_m_coach_profile').update(patch).eq('user_id', coachId);
  if (error) throw error;
}
