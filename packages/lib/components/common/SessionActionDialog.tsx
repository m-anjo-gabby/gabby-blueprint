'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, Plus, X as XIcon } from 'lucide-react';
import { cn } from '../../utils';
import { useToast } from '../../hooks/useToast';
import { useUserStore } from '../../stores/useUserStore';
import { generateLessonStartTimeOptions } from '../../date/date';
import { CounterpartLocalTime } from './CounterpartLocalTime';
import { SESSION_STATUS, SessionListItem, SessionStatus, ProposedSlotInput } from '@gabby/types/session';

/**
 * ----------------------------------------------
 * 最小限のDialog/Button/Label/Textareaプリミティブ（shadcn/uiと同一の見た目・クラス構成）
 * ----------------------------------------------
 * apps/student・apps/coachそれぞれの`@/components/ui/*`はアプリローカルなshadcn生成物のため
 * packages/libから直接importできない。本コンポーネントはポータル共通のため、
 * @radix-ui/react-dialogを直接利用し、同じ見た目になるよう最小限だけ複製する。
 */

const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <XIcon className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
);

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';
const BUTTON_VARIANTS = {
  default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
  outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
};
const BUTTON_SIZES = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
};

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS; size?: keyof typeof BUTTON_SIZES }) {
  return <button className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)} {...props} />;
}

function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />;
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
      {...props}
    />
  );
}

const INPUT_CLASS =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm';

// ----------------------------------------------

const PROPOSED_TIME_OPTIONS = generateLessonStartTimeOptions('00:00', '23:59');
const MAX_PROPOSED_SLOTS = 3;

export interface SessionActionTarget {
  session: SessionListItem;
  mode: 'cancel' | 'resolve';
}

interface ProposedSlotDraft {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  conflictMessage: string | null;
  isChecking: boolean;
}

function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function isWithin12Hours(startDatetime: string): boolean {
  return new Date(startDatetime).getTime() - Date.now() < TWELVE_HOURS_MS;
}

export interface SessionActionDialogActions {
  cancelSession: (
    sessionId: string,
    reason?: string,
    proposedSlots?: ProposedSlotInput[]
  ) => Promise<{ success: true } | { success: false; message: string }>;
  checkSessionConflict: (
    coachId: string,
    studentId: string,
    startIso: string,
    endIso: string,
    excludeSessionId?: string
  ) => Promise<{ success: true; coachConflict: boolean; studentConflict: boolean } | { success: false; message: string }>;
  /** 期限超過セッションの手動解決（コーチのみ使用。生徒側では渡さない） */
  resolveStaleSession?: (
    sessionId: string,
    resolvedStatus: SessionStatus,
    reason: string
  ) => Promise<{ success: true } | { success: false; message: string }>;
}

export interface SessionActionDialogCancelLabels {
  title: string;
  description: (counterpartName: string) => string;
  /** キャンセル時のチケット返還可否についての注記（開始12時間切りかどうかで文言・色調を出し分ける） */
  policyNote: (isWithin12Hours: boolean) => { text: string; tone: 'warning' | 'success' };
  reasonLabel: string;
  reasonPlaceholder: string;
  proposedSlotsLabel: string;
  addSlotButton: string;
  noSlotsHint: string;
  timePlaceholder: string;
  removeSlotLabel: string;
  checkingText: string;
  conflictMessages: { coach: string; student: string };
  backButton: string;
  submitButton: string;
  successToast: (hasProposals: boolean) => string;
  counterpartTimeLabel: string;
  counterpartTimeCaution: string;
}

export interface SessionActionDialogResolveLabels {
  title: string;
  description: (counterpartName: string) => string;
  outcomeLabel: string;
  statusOptions: { value: SessionStatus; label: string }[];
  reasonLabel: string;
  reasonPlaceholder: string;
  backButton: string;
  submitButton: string;
  successToast: string;
}

export interface SessionActionDialogLabels {
  cancel: SessionActionDialogCancelLabels;
  /** 期限超過セッションの手動解決モード。コーチのみ使用するため、生徒側では省略してよい */
  resolve?: SessionActionDialogResolveLabels;
}

export interface SessionActionDialogProps {
  target: SessionActionTarget | null;
  onClose: () => void;
  onResolved: (sessionId: string, patch: Partial<SessionListItem>) => void;
  actions: SessionActionDialogActions;
  labels: SessionActionDialogLabels;
  /** 相手のタイムゾーンでの日時を表示用にフォーマットする（アプリの言語規約に合わせて注入する） */
  formatCounterpartTime: (datetime: string, timezone: string) => string;
}

/**
 * セッションのキャンセル・期限超過セッションの手動解決を行う共通ダイアログ（ポータル共通）。
 * apps/student・apps/coach双方の同名コンポーネントを統合したもので、文言・サーバーアクションは
 * すべて呼び出し側からprops経由で注入する（本コンポーネント自体は日本語・英語のどちらの
 * 文字列も一切ハードコードしない）。
 * キャンセル時は、セッションに紐づくviewer_role/counterpart_id/counterpart_timezoneから
 * コーチ・生徒それぞれのID、および相手のタイムゾーンでの開始日時表示を導出する。
 */
export function SessionActionDialog({ target, onClose, onResolved, actions, labels, formatCounterpartTime }: SessionActionDialogProps) {
  const currentUserId = useUserStore((state) => state.user?.id);
  const [reason, setReason] = useState('');
  const [proposedSlots, setProposedSlots] = useState<ProposedSlotDraft[]>([]);
  const [resolvedStatus, setResolvedStatus] = useState<SessionStatus>(SESSION_STATUS.COMPLETED);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    setReason('');
    setProposedSlots([]);
    if (target?.mode === 'resolve') {
      setResolvedStatus(SESSION_STATUS.COMPLETED);
    }
  }, [target]);

  const isCoachViewer = target?.session.viewer_role === 'coach';
  const coachId = target ? (isCoachViewer ? currentUserId : target.session.counterpart_id) : undefined;
  const studentId = target ? (isCoachViewer ? target.session.counterpart_id : currentUserId) : undefined;
  const cancelStatus = isCoachViewer ? SESSION_STATUS.CANCELLED_BY_COACH : SESSION_STATUS.CANCELLED_BY_STUDENT;

  const addProposedSlot = () => {
    setProposedSlots((prev) =>
      prev.length >= MAX_PROPOSED_SLOTS ? prev : [...prev, { date: tomorrowIsoDate(), time: '', conflictMessage: null, isChecking: false }]
    );
  };

  const checkSlotConflict = async (index: number, date: string, time: string) => {
    if (!target || !coachId || !studentId) return;
    setProposedSlots((prev) => prev.map((s, i) => (i === index ? { ...s, isChecking: true } : s)));

    const duration = new Date(target.session.end_datetime).getTime() - new Date(target.session.start_datetime).getTime();
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + duration);
    const result = await actions.checkSessionConflict(coachId, studentId, start.toISOString(), end.toISOString(), target.session.session_id);

    setProposedSlots((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        if (!result.success) return { ...s, isChecking: false };
        const message = result.coachConflict
          ? labels.cancel.conflictMessages.coach
          : result.studentConflict
            ? labels.cancel.conflictMessages.student
            : null;
        return { ...s, isChecking: false, conflictMessage: message };
      })
    );
  };

  const updateProposedSlot = (index: number, patch: Partial<Pick<ProposedSlotDraft, 'date' | 'time'>>) => {
    setProposedSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch, conflictMessage: null } : slot)));
    const merged = { ...proposedSlots[index], ...patch };
    if (merged.date && merged.time) checkSlotConflict(index, merged.date, merged.time);
  };

  const removeProposedSlot = (index: number) => {
    setProposedSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const hasBlockingConflict = proposedSlots.some((s) => s.date && s.time && s.conflictMessage);

  const handleCancel = async () => {
    if (!target || hasBlockingConflict) return;
    setIsSubmitting(true);
    try {
      const validSlots = proposedSlots.filter((s) => s.date && s.time && !s.conflictMessage);
      const duration = new Date(target.session.end_datetime).getTime() - new Date(target.session.start_datetime).getTime();
      const proposedSlotInputs: ProposedSlotInput[] = validSlots.map((s) => {
        const start = new Date(`${s.date}T${s.time}:00`);
        const end = new Date(start.getTime() + duration);
        return { start_datetime: start.toISOString(), end_datetime: end.toISOString() };
      });

      const result = await actions.cancelSession(target.session.session_id, reason, proposedSlotInputs);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(target.session.session_id, { status: cancelStatus, cancel_reason: reason || null });
      showToast(labels.cancel.successToast(proposedSlotInputs.length > 0), 'success');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async () => {
    if (!target || !reason.trim() || !actions.resolveStaleSession || !labels.resolve) return;
    setIsSubmitting(true);
    try {
      const result = await actions.resolveStaleSession(target.session.session_id, resolvedStatus, reason);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(target.session.session_id, { status: resolvedStatus });
      showToast(labels.resolve.successToast, 'success');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const policyNote = target?.mode === 'cancel' ? labels.cancel.policyNote(isWithin12Hours(target.session.start_datetime)) : null;

  return (
    <DialogPrimitive.Root open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target?.mode === 'cancel' && (
          <>
            <DialogHeader>
              <DialogTitle>{labels.cancel.title}</DialogTitle>
              <DialogDescription>{labels.cancel.description(target.session.counterpart_name)}</DialogDescription>
            </DialogHeader>
            {policyNote && (
              <p
                className={cn(
                  'text-xs rounded-lg px-3 py-2 border',
                  policyNote.tone === 'warning'
                    ? 'text-rose-600 bg-rose-50 border-rose-100'
                    : 'text-emerald-700 bg-emerald-50 border-emerald-100'
                )}
              >
                {policyNote.text}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>{labels.cancel.reasonLabel}</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={labels.cancel.reasonPlaceholder} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{labels.cancel.proposedSlotsLabel}</Label>
                {proposedSlots.length < MAX_PROPOSED_SLOTS && (
                  <Button type="button" size="sm" variant="outline" onClick={addProposedSlot}>
                    <Plus size={13} />
                    {labels.cancel.addSlotButton}
                  </Button>
                )}
              </div>
              {proposedSlots.length === 0 ? (
                <p className="text-[11px] text-slate-400">{labels.cancel.noSlotsHint}</p>
              ) : (
                <div className="space-y-2">
                  {proposedSlots.map((slot, index) => {
                    const proposedStart = slot.date && slot.time ? `${slot.date}T${slot.time}:00` : null;
                    return (
                      <div key={index} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            min={tomorrowIsoDate()}
                            value={slot.date}
                            onChange={(e) => updateProposedSlot(index, { date: e.target.value })}
                            className={cn(INPUT_CLASS, 'flex-1')}
                          />
                          <select
                            value={slot.time}
                            onChange={(e) => updateProposedSlot(index, { time: e.target.value })}
                            className={cn(INPUT_CLASS, 'w-28 px-2 py-1')}
                          >
                            <option value="" disabled>
                              {labels.cancel.timePlaceholder}
                            </option>
                            {PROPOSED_TIME_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeProposedSlot(index)}
                            className="shrink-0 text-slate-400 hover:text-rose-500 transition-colors p-1"
                            title={labels.cancel.removeSlotLabel}
                          >
                            <XIcon size={14} />
                          </button>
                        </div>
                        {slot.isChecking && <p className="text-[11px] text-slate-400">{labels.cancel.checkingText}</p>}
                        {slot.conflictMessage && <p className="text-[11px] text-rose-600">{slot.conflictMessage}</p>}
                        {!slot.conflictMessage && proposedStart && (
                          <CounterpartLocalTime
                            datetime={proposedStart}
                            timezone={target.session.counterpart_timezone}
                            label={labels.cancel.counterpartTimeLabel}
                            cautionText={labels.cancel.counterpartTimeCaution}
                            format={formatCounterpartTime}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                {labels.cancel.backButton}
              </Button>
              <Button type="button" onClick={handleCancel} disabled={isSubmitting || hasBlockingConflict}>
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {labels.cancel.submitButton}
              </Button>
            </DialogFooter>
          </>
        )}

        {target?.mode === 'resolve' && labels.resolve && (
          <>
            <DialogHeader>
              <DialogTitle>{labels.resolve.title}</DialogTitle>
              <DialogDescription>{labels.resolve.description(target.session.counterpart_name)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{labels.resolve.outcomeLabel}</Label>
                <select
                  value={resolvedStatus}
                  onChange={(e) => setResolvedStatus(Number(e.target.value) as SessionStatus)}
                  className={cn(INPUT_CLASS, 'w-full')}
                >
                  {labels.resolve.statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{labels.resolve.reasonLabel}</Label>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={labels.resolve.reasonPlaceholder} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                {labels.resolve.backButton}
              </Button>
              <Button type="button" onClick={handleResolve} disabled={isSubmitting || !reason.trim()}>
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {labels.resolve.submitButton}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </DialogPrimitive.Root>
  );
}
