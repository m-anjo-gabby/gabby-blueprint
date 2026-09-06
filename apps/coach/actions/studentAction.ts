'use server';

import {
  getAssignedStudentsCore,
  getStudentOverviewCore,
  getStudentSessionHistoryCore,
  getStudentUpcomingSessionCore,
  getStudentLiveSessionShortfallsCore,
  getStudentNotesCore,
  getSelfTrainingWeekSummaryCore,
  addCoachStudentNoteCore,
  updateStudentSprintLevelCore,
  forceStageUpStudentCore,
} from '@gabby/lib/coachStudent/actions/coachStudentActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  AssignedStudentSummary,
  StudentOverviewProfile,
  StudentSessionHistoryItem,
  LiveSessionShortfallItem,
  CoachStudentNote,
  CoachStudentErrorCode,
  StudentSprintProgress,
  SelfTrainingWeekSummary,
} from '@gabby/types/coachStudent';
import { SprintQuestionType } from '@gabby/types/sprint';

const logger = createLogger('coach');

const COACH_STUDENT_ERROR_MESSAGES_EN: Record<CoachStudentErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have access to this student.',
  invalid_input: 'Please enter a note before saving.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * Fetches students currently assigned to the logged-in coach
 */
export async function getAssignedStudents(): Promise<AssignedStudentSummary[]> {
  const result = await getAssignedStudentsCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_assigned_students_failed', result.errorCode, ctx);
    return [];
  }
  return result.students;
}

/**
 * Fetches the Student Overview header data (basic info + sprint progress) for one student
 */
export async function getStudentOverview(
  studentId: string
): Promise<{ success: true; profile: StudentOverviewProfile } | { success: false; message: string }> {
  const result = await getStudentOverviewCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_overview_failed', result.errorCode, ctx);
    return { success: false, message: COACH_STUDENT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, profile: result.profile };
}

/**
 * Fetches this coach's live session history with the given student
 */
export async function getStudentSessionHistory(studentId: string): Promise<StudentSessionHistoryItem[]> {
  const result = await getStudentSessionHistoryCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_session_history_failed', result.errorCode, ctx);
    return [];
  }
  return result.sessions;
}

/**
 * Fetches the next session with this student that is still scheduled and hasn't ended yet
 * (used to decide which session_id "Start Live Session"/"End Lesson" should target — deliberately
 * a dedicated, tightly-filtered query rather than derived from getStudentSessionHistory's
 * descending/limited history list, since that list can omit the nearest upcoming session once
 * enough future sessions have been pre-generated for a long contract).
 */
export async function getStudentUpcomingSession(studentId: string): Promise<StudentSessionHistoryItem | null> {
  const result = await getStudentUpcomingSessionCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_upcoming_session_failed', result.errorCode, ctx);
    return null;
  }
  return result.session;
}

/**
 * Fetches live session shortfalls (contracted sessions that couldn't all be scheduled,
 * typically because the matching request was approved partway through the license period)
 * for this coach's schedules with the given student.
 */
export async function getStudentLiveSessionShortfalls(studentId: string): Promise<LiveSessionShortfallItem[]> {
  const result = await getStudentLiveSessionShortfallsCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_session_shortfalls_failed', result.errorCode, ctx);
    return [];
  }
  return result.shortfalls;
}

/**
 * Fetches this coach's private notes about the given student
 */
export async function getStudentNotes(studentId: string): Promise<CoachStudentNote[]> {
  const result = await getStudentNotesCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_notes_failed', result.errorCode, ctx);
    return [];
  }
  return result.notes;
}

const DEFAULT_SELF_TRAINING_WEEK_SUMMARY: SelfTrainingWeekSummary = { days: 7, active_days: 0, total_questions: 0, total_assessments: 0 };

/**
 * Fetches a summary (active days / total questions / total speaking assessments) of this
 * student's self-training activity over the last `days` days. Used by the session prep/execution
 * hub so a coach can check recent self-training activity without leaving the page.
 */
export async function getSelfTrainingWeekSummary(studentId: string, days = 7): Promise<SelfTrainingWeekSummary> {
  const result = await getSelfTrainingWeekSummaryCore(studentId, days);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_self_training_week_summary_failed', result.errorCode, ctx);
    return DEFAULT_SELF_TRAINING_WEEK_SUMMARY;
  }
  return result.summary;
}

/**
 * Adds a private coach note for the given student
 */
export async function addCoachStudentNote(
  studentId: string,
  noteText: string
): Promise<{ success: true; note: CoachStudentNote } | { success: false; message: string }> {
  const result = await addCoachStudentNoteCore(studentId, noteText);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:add_student_note_failed', result.errorCode, ctx);
    return { success: false, message: COACH_STUDENT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, note: result.note };
}

type UpdateSprintProgressActionResult =
  | { success: true; progress: StudentSprintProgress }
  | { success: false; message: string };

function resolveSprintProgressErrorMessage(errorCode: CoachStudentErrorCode, invalidInputMessage: string): string {
  return errorCode === 'invalid_input' ? invalidInputMessage : COACH_STUDENT_ERROR_MESSAGES_EN[errorCode];
}

/**
 * Raises a single question type's level for the given student (level-up only, never down)
 */
export async function updateStudentSprintLevel(
  studentId: string,
  questionType: SprintQuestionType,
  newLevel: number
): Promise<UpdateSprintProgressActionResult> {
  const result = await updateStudentSprintLevelCore(studentId, questionType, newLevel);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:update_student_sprint_level_failed', result.errorCode, ctx);
    return {
      success: false,
      message: resolveSprintProgressErrorMessage(result.errorCode, 'Please select a level higher than the current one.'),
    };
  }
  return { success: true, progress: result.progress };
}

/**
 * Forces the given student's stage up to targetStage. Question types that already meet the
 * requirement keep their current level; unmet ones are raised to the minimum required level.
 */
export async function forceStageUpStudent(
  studentId: string,
  targetStage: number
): Promise<UpdateSprintProgressActionResult> {
  const result = await forceStageUpStudentCore(studentId, targetStage);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:force_stage_up_student_failed', result.errorCode, ctx);
    return {
      success: false,
      message: resolveSprintProgressErrorMessage(result.errorCode, 'Please select a stage higher than the current one.'),
    };
  }
  return { success: true, progress: result.progress };
}
