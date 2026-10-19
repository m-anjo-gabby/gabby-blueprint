'use server';

import { getMyProfileCore } from '@gabby/lib/profile/actions/profileActions';
import { uploadProfileIconCore, removeProfileIconCore } from '@gabby/lib/profile/actions/profileIconActions';
import { getTimezoneListCore, updateMyTimezoneCore } from '@gabby/lib/profile/actions/timezoneActions';
import { getCountryListCore } from '@gabby/lib/country/actions/countryActions';
import {
  getCoachSpecialtyCodesCore,
  getCoachSpecialtyListCore,
} from '@gabby/lib/coachSpecialty/actions/coachSpecialtyActions';
import { toCoachSpecialtyTags } from '@gabby/lib/coachSpecialty/tags';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import {
  getMyCoachProfileCore,
  updateMyCoachProfileCore,
  updateMyCoachZoomSettingsCore,
} from '@gabby/lib/coachProfile/actions/coachProfileActions';
import {
  uploadCoachIntroVideoCore,
  removeCoachIntroVideoCore,
} from '@gabby/lib/coachProfile/actions/coachIntroVideoActions';
import {
  getCoachMatchingStatusCore,
  updateMyAcceptingStudentsCore,
} from '@gabby/lib/coachProfile/actions/coachMatchingStatusActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { type ProfileIconErrorCode, type MyProfile, type UpdateTimezoneErrorCode } from '@gabby/types/profile';
import { type TimezoneMaster } from '@gabby/types/timezone';
import { type CountryMaster } from '@gabby/types/country';
import { type CoachSpecialtyTag } from '@gabby/types/coachSpecialty';
import {
  type CoachProfileErrorCode,
  type CoachProfileFormValues,
  type CoachProfileRecord,
  type CoachIntroVideoErrorCode,
  type CoachMatchingStatus,
  type CoachZoomSettingsFormValues,
} from '@gabby/types/coachProfile';
import type { ActionResult } from '@gabby/types/action';

const logger = createLogger('coach');

const COACH_PROFILE_ERROR_MESSAGES_EN: Record<CoachProfileErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_input: 'Please check the values you entered.',
  db_update_failed: 'Failed to update your public profile.',
  unexpected_error: 'An unexpected error occurred.',
};

const ERROR_MESSAGES_EN: Record<ProfileIconErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  no_file: 'No file was selected.',
  file_too_large: 'The file size must be 5MB or less.',
  invalid_mime_type: 'Only PNG, JPEG, or WebP images are supported.',
  upload_failed: 'Failed to upload the image.',
  db_update_failed: 'Failed to update your profile.',
  unexpected_error: 'An unexpected error occurred.',
};

const COACH_INTRO_VIDEO_ERROR_MESSAGES_EN: Record<CoachIntroVideoErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  no_file: 'No file was selected.',
  file_too_large: 'The file size must be 100MB or less.',
  invalid_mime_type: 'Only MP4, WebM, or MOV videos are supported.',
  upload_failed: 'Failed to upload the video.',
  db_update_failed: 'Failed to update your profile.',
  unexpected_error: 'An unexpected error occurred.',
};

const TIMEZONE_ERROR_MESSAGES_EN: Record<UpdateTimezoneErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_timezone: 'The selected timezone is not available.',
  db_update_failed: 'Failed to update your timezone.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * ログイン中のコーチのプロフィールを取得する
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  const result = await getMyProfileCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_my_profile_failed', result.errorCode, ctx);
    return null;
  }
  return result.profile;
}

/**
 * プロフィールのアイコンの画像をアップロードする
 */
export async function uploadProfileIcon(formData: FormData): Promise<ActionResult<{ iconPath: string }>> {
  const ctx = await getLogContext();
  const result = await uploadProfileIconCore(formData);

  if (!result.success) {
    logger.error('coach:upload_profile_icon_failed', result.errorCode, ctx);
    return { success: false, message: ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:upload_profile_icon_success', 'Coach profile icon updated', ctx);
  return { success: true, iconPath: result.iconPath };
}

/**
 * プロフィールのアイコンの画像を削除する
 */
export async function removeProfileIcon(): Promise<ActionResult> {
  const ctx = await getLogContext();
  const result = await removeProfileIconCore();

  if (!result.success) {
    logger.error('coach:remove_profile_icon_failed', result.errorCode, ctx);
    return { success: false, message: ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:remove_profile_icon_success', 'Coach profile icon removed', ctx);
  return { success: true };
}

/**
 * 選べるタイムゾーンの一覧を取得する
 */
export async function getTimezoneList(): Promise<TimezoneMaster[]> {
  const result = await getTimezoneListCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_timezone_list_failed', result.errorCode, ctx);
    return [];
  }
  return result.timezones;
}

/**
 * ログイン中のコーチのタイムゾーンを更新する
 */
export async function updateMyTimezone(timezone: string): Promise<ActionResult<{ timezone: string }>> {
  const ctx = await getLogContext();
  const result = await updateMyTimezoneCore(timezone);

  if (!result.success) {
    logger.error('coach:update_timezone_failed', result.errorCode, ctx);
    return { success: false, message: TIMEZONE_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:update_timezone_success', `Coach timezone updated: ${result.timezone}`, ctx);
  return { success: true, timezone: result.timezone };
}

/**
 * ログイン中のコーチの専門を取得する（アドミンだけが設定し、コーチは見るだけ）
 */
export async function getMyCoachSpecialties(): Promise<CoachSpecialtyTag[]> {
  const user = await getAuthUser();
  if (!user) return [];

  const [listResult, codesByCoachId] = await Promise.all([
    getCoachSpecialtyListCore(),
    getCoachSpecialtyCodesCore([user.id]),
  ]);
  if (!listResult.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_my_specialties_failed', listResult.errorCode, ctx);
    return [];
  }
  return toCoachSpecialtyTags(codesByCoachId.get(user.id) ?? [], listResult.specialties, 'en');
}

/**
 * 選べる国（国籍）の一覧を取得する
 */
export async function getCountryList(): Promise<CountryMaster[]> {
  const result = await getCountryListCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_country_list_failed', result.errorCode, ctx);
    return [];
  }
  return result.countries;
}

/**
 * ログイン中のコーチの公開プロフィール（生徒に見えるもの）を取得する
 */
export async function getMyCoachProfile(): Promise<CoachProfileRecord | null> {
  const result = await getMyCoachProfileCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_my_coach_profile_failed', result.errorCode, ctx);
    return null;
  }
  return result.profile;
}

/**
 * ログイン中のコーチの公開プロフィールを更新する
 */
export async function updateMyCoachProfile(
  values: CoachProfileFormValues,
): Promise<ActionResult<{ profile: CoachProfileRecord }>> {
  const ctx = await getLogContext();
  const result = await updateMyCoachProfileCore(values);

  if (!result.success) {
    logger.error('coach:update_coach_profile_failed', result.errorCode, ctx);
    return { success: false, message: COACH_PROFILE_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:update_coach_profile_success', 'Coach public profile updated', ctx);
  return { success: true, profile: result.profile };
}

/**
 * ログイン中のコーチが生徒のコーチ検索に出るかを取得する（足りない項目・受付の可否・アドミンによる停止）
 */
export async function getMyCoachMatchingStatus(): Promise<CoachMatchingStatus | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const result = await getCoachMatchingStatusCore(user.id);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_matching_status_failed', result.errorCode, ctx);
    return null;
  }
  return result.status;
}

/**
 * ログイン中のコーチの新しい生徒の受付を切り替える
 */
export async function updateMyAcceptingStudents(
  acceptingStudents: boolean,
): Promise<ActionResult<{ acceptingStudents: boolean }>> {
  const result = await updateMyAcceptingStudentsCore(acceptingStudents);
  if (!result.success) {
    return { success: false, message: COACH_PROFILE_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, acceptingStudents: result.acceptingStudents };
}

/**
 * ログイン中のコーチのライブセッションのビデオ通話の URL（Zoom）を更新する
 */
export async function updateMyCoachZoomSettings(
  values: CoachZoomSettingsFormValues,
): Promise<ActionResult<{ profile: CoachProfileRecord }>> {
  const ctx = await getLogContext();
  const result = await updateMyCoachZoomSettingsCore(values);

  if (!result.success) {
    logger.error('coach:update_zoom_settings_failed', result.errorCode, ctx);
    return { success: false, message: COACH_PROFILE_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:update_zoom_settings_success', 'Coach zoom meeting URL updated', ctx);
  return { success: true, profile: result.profile };
}

/**
 * コーチの紹介動画をアップロードする
 */
export async function uploadCoachIntroVideo(formData: FormData): Promise<ActionResult<{ introVideoPath: string }>> {
  const ctx = await getLogContext();
  const result = await uploadCoachIntroVideoCore(formData);

  if (!result.success) {
    logger.error('coach:upload_intro_video_failed', result.errorCode, ctx);
    return { success: false, message: COACH_INTRO_VIDEO_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:upload_intro_video_success', 'Coach intro video updated', ctx);
  return { success: true, introVideoPath: result.introVideoPath };
}

/**
 * コーチの紹介動画を削除する
 */
export async function removeCoachIntroVideo(): Promise<ActionResult> {
  const ctx = await getLogContext();
  const result = await removeCoachIntroVideoCore();

  if (!result.success) {
    logger.error('coach:remove_intro_video_failed', result.errorCode, ctx);
    return { success: false, message: COACH_INTRO_VIDEO_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:remove_intro_video_success', 'Coach intro video removed', ctx);
  return { success: true };
}
