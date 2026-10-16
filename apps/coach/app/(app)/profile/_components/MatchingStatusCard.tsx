'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, CircleAlert, PauseCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@gabby/lib/hooks/useToast';
import { CoachMatchingRequiredItem } from '@gabby/types/coachProfile';
import { isCoachMatchable } from '@gabby/lib/coachProfile/matchingReadiness';
import { updateMyAcceptingStudents } from '@/actions/coachProfileAction';
import { SAVE_NETWORK_ERROR_MESSAGE } from '@/constants/network';

const ITEM_LABELS: Record<CoachMatchingRequiredItem, string> = {
  icon: 'Profile photo',
  country: 'Nationality',
  teaching_years: 'English teaching experience',
  education: 'Education',
  qualifications: 'Qualifications',
  job_experience: 'Job experience',
  introduction: 'Personal introduction',
  availability: 'Weekly availability',
};

/** Where each missing item is filled in */
function ItemHint({ item }: { item: CoachMatchingRequiredItem }) {
  if (item === 'availability') {
    return (
      <Link href="/availability" className="font-bold text-brand underline-offset-2 hover:underline">
        Set your availability
      </Link>
    );
  }
  if (item === 'icon') return <span className="text-slate-500">Upload it in the account section below</span>;
  return <span className="text-slate-500">Fill it in under Public Coach Profile</span>;
}

interface MatchingStatusCardProps {
  /** Missing required items, from the saved profile (null if the status could not be loaded) */
  missingItems: CoachMatchingRequiredItem[] | null;
  initialAcceptingStudents: boolean;
  isSuspended: boolean;
}

/**
 * Whether the coach appears in the students' coach search, with the reasons when not.
 * The "Accept new students" switch is saved immediately and reverted if saving fails.
 */
export function MatchingStatusCard({ missingItems, initialAcceptingStudents, isSuspended }: MatchingStatusCardProps) {
  const [acceptingStudents, setAcceptingStudents] = useState(initialAcceptingStudents);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  const handleChange = async (next: boolean) => {
    setAcceptingStudents(next);
    setIsSaving(true);
    // A failed request (e.g. network error) throws instead of returning a result, so treat it as a failure too
    const result = await updateMyAcceptingStudents(next)
      .catch((): { success: false; message: string } => ({ success: false, message: SAVE_NETWORK_ERROR_MESSAGE }))
      .finally(() => setIsSaving(false));
    if (!result.success) {
      setAcceptingStudents(!next);
      showToast(result.message, 'error');
      return;
    }
    showToast(next ? 'You are now accepting new students' : 'You are no longer accepting new students', 'success');
  };

  const isVisible = missingItems !== null && isCoachMatchable({ missingItems, acceptingStudents, isSuspended });

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-slate-800">Student matching</h2>
          <p className="text-xs text-slate-500">
            Students can find you in the coach search and send you matching requests only while you are visible.
          </p>
        </div>
        {missingItems !== null &&
          (isVisible ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              <CheckCircle2 size={12} /> Visible to students
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
              <CircleAlert size={12} /> Not visible to students
            </span>
          ))}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
        <div className="min-w-0">
          <label htmlFor="accepting-students" className="text-sm font-bold text-slate-700">
            Accept new students
          </label>
          <p className="text-xs text-slate-500">
            Turn this off while you take a break. Your current students and scheduled sessions are not affected.
          </p>
        </div>
        <Switch id="accepting-students" checked={acceptingStudents} disabled={isSaving} onCheckedChange={handleChange} />
      </div>

      {isSuspended && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <PauseCircle size={14} className="mt-0.5 shrink-0" />
          <p>
            Matching has been paused by the Gabby team. You will not appear in the coach search until the Gabby team
            resumes it. Please contact the Gabby team for details.
          </p>
        </div>
      )}

      {missingItems === null ? (
        <p className="text-xs text-slate-500">Could not load your matching status. Please try again later.</p>
      ) : (
        missingItems.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <p className="flex items-center gap-1.5 font-bold">
              <AlertTriangle size={14} className="shrink-0" />
              Complete the following to appear in the coach search:
            </p>
            <ul className="mt-1.5 space-y-1 pl-5">
              {missingItems.map((item) => (
                <li key={item} className="list-disc">
                  <span className="font-bold">{ITEM_LABELS[item]}</span> — <ItemHint item={item} />
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </section>
  );
}
