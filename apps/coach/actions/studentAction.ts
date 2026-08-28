'use server';

import {
  getAssignedStudentsCore,
  getStudentOverviewCore,
  getStudentSessionHistoryCore,
  getStudentNotesCore,
  addCoachStudentNoteCore,
} from '@gabby/lib/coachStudent/actions/coachStudentActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  AssignedStudentSummary,
  StudentOverviewProfile,
  StudentSessionHistoryItem,
  CoachStudentNote,
  CoachStudentErrorCode,
} from '@gabby/types/coachStudent';

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
