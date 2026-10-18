import { CONDUCTED_VIA, SESSION_OUTCOME } from '@gabby/types/session';
import type { SessionOutcomeFieldsLabels } from '@gabby/lib/components/common/SessionOutcomeFields';
import type { OutcomeReasonKind } from '@gabby/lib/session/outcome';

/** English labels for the shared session outcome fields (Coach portal End Session dialog). */
export const COACH_SESSION_OUTCOME_LABELS: SessionOutcomeFieldsLabels = {
  outcomeLegend: 'What happened?',
  outcomes: {
    [SESSION_OUTCOME.COMPLETED]: {
      label: 'Completed',
      hint: "The lesson took place. Uses one of the student's sessions.",
    },
    [SESSION_OUTCOME.STUDENT_LEFT_EARLY]: {
      label: 'Ended early (student’s reason)',
      hint: "The student had to leave early. Uses one of the student's sessions.",
    },
    [SESSION_OUTCOME.STUDENT_NO_SHOW]: { label: 'Student didn’t show up', hint: "Uses one of the student's sessions." },
    [SESSION_OUTCOME.COACH_ABSENT]: {
      label: 'I missed this session',
      hint: "The student's session is returned and they are notified, so a makeup can be booked.",
    },
    [SESSION_OUTCOME.TECHNICAL_ISSUE]: {
      label: 'Couldn’t hold the lesson (technical issues)',
      hint: "e.g. neither the app call nor Zoom worked. The student's session is returned for a makeup.",
    },
  },
  suggestedBadge: 'Suggested by call log',
  conductedViaLegend: 'How was it held?',
  conductedVia: {
    [CONDUCTED_VIA.APP]: 'In the app',
    [CONDUCTED_VIA.EXTERNAL_ZOOM]: 'External Zoom (the app call didn’t work)',
  },
  evidenceTitle: 'In-app call record',
  evidenceLoading: 'Checking the call record…',
  evidenceFailed: 'The call record could not be loaded. You can still record the outcome.',
  evidenceSummary: (e) => {
    if (!e.coachJoined) return 'You did not join the in-app call for this session.';
    const together = Math.floor(e.overlapSeconds / 60);
    return e.studentJoined
      ? `You and the student were connected together for ${together} min.`
      : 'You joined the in-app call, but the student never joined.';
  },
  reasonLabel: 'Note',
  reasonOptional: '(optional)',
  reasonPlaceholder: 'e.g. The app call kept dropping, so we switched to my Zoom and finished the lesson there.',
};

/** Why a note is required (shown above the note field). */
export const COACH_OUTCOME_REASON_HINTS: Record<OutcomeReasonKind, string> = {
  not_conducted: 'Please explain why the lesson didn’t take place.',
  left_early: 'Please note why the student left early.',
  external: 'Please note why the app call couldn’t be used.',
  mismatch: 'This is different from the in-app call record — please explain what happened.',
};
