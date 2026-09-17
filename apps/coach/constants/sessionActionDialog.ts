import { STALE_SESSION_RESOLUTION } from '@gabby/types/session';
import type { SessionActionDialogLabels } from '@gabby/lib/components/common/SessionActionDialog';

/** English labels for the shared session cancel/resolve dialog (Coach portal). */
export const COACH_SESSION_ACTION_LABELS: SessionActionDialogLabels = {
  cancel: {
    title: 'Cancel Session',
    description: (counterpartName) => `Cancel your lesson with ${counterpartName}.`,
    policyNote: () => ({
      text: "As the coach, the student's ticket is always refunded. Booking a new time is up to the student — you can optionally suggest times below, but the choice is theirs.",
      tone: 'success',
    }),
    reasonLabel: 'Reason (optional)',
    reasonPlaceholder: "e.g. I'm unable to make this time.",
    proposedSlotsLabel: 'Propose alternative times (optional, up to 3)',
    addSlotButton: 'Add time',
    noSlotsHint: "These don't have to be within your usual availability — offer any time that works for you this once.",
    timePlaceholder: 'Time',
    removeSlotLabel: 'Remove',
    checkingText: 'Checking…',
    conflictMessages: {
      coach: 'You already have another session at this time.',
      student: 'The student already has another session at this time.',
    },
    tooSoonMessage: 'This time is less than 24 hours away. Please choose a time from tomorrow onward.',
    backButton: 'Back',
    submitButton: 'Cancel Session',
    successToast: (hasProposals) => (hasProposals ? 'Session cancelled. Your proposed times were sent to the student.' : 'Session cancelled.'),
    counterpartTimeLabel: "Student's local time",
    counterpartTimeCaution: 'late night / early morning for the student',
  },
  resolve: {
    title: 'Resolve Session',
    description: (counterpartName) =>
      `This session with ${counterpartName} is past its scheduled end time but still shows as scheduled (e.g. it was conducted outside the app, or the End Session button was never pressed). Record what actually happened.`,
    outcomeLabel: 'Outcome',
    statusOptions: [
      { value: STALE_SESSION_RESOLUTION.NORMAL, label: 'Completed (conducted outside the app)' },
      { value: STALE_SESSION_RESOLUTION.NO_SHOW, label: 'No-show (the student never showed up)' },
      { value: STALE_SESSION_RESOLUTION.COACH_NO_SHOW, label: "I missed this session (cancels it — the student's ticket is refunded)" },
    ],
    reasonLabel: 'Reason (required)',
    reasonPlaceholder: 'e.g. Conducted the lesson over a direct Zoom call instead.',
    backButton: 'Back',
    submitButton: 'Resolve',
    successToast: 'Session resolved.',
  },
};
