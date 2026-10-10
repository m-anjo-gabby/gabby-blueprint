'use client';

import { useState, useTransition } from 'react';
import { GraduationCap, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StarRatingInput } from '@gabby/lib/components/common/StarRating';
import { useToast } from '@gabby/lib/hooks/useToast';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { COACH_RATING_FEEDBACK_MAX_LENGTH, type CoachRatingItem, type PendingCoachRating } from '@gabby/types/coachRating';
import { submitCoachRating } from '@/actions/coachRatingAction';
import { COACH_RATING_ITEMS, ratingOptionLabel } from '@/constants/coachRating';

type Scores = Record<CoachRatingItem, number | null>;
const EMPTY_SCORES: Scores = { coaching: null, friendliness: null, recommendation: null };

interface CoachRatingDialogProps {
  /** 評価するコーチ（null で閉じる） */
  target: PendingCoachRating | null;
  onClose: () => void;
  onSubmitted: () => void;
}

/**
 * 専属コーチの評価（契約×コーチにつき1回。送信後は変更できない）。
 * 星は3項目とも必須、運営へのコメントは任意でコーチには公開しない。
 */
export function CoachRatingDialog({ target, onClose, onSubmitted }: CoachRatingDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-w-md rounded-panel border border-line/60 bg-surface p-6 text-ink shadow-2xl"
      >
        {/* 対象が替わるたびに入力を初期化する */}
        {target && <CoachRatingForm key={`${target.ticketId}:${target.coachId}`} target={target} onClose={onClose} onSubmitted={onSubmitted} />}
      </DialogContent>
    </Dialog>
  );
}

function CoachRatingForm({ target, onClose, onSubmitted }: { target: PendingCoachRating; onClose: () => void; onSubmitted: () => void }) {
  const { showToast } = useToast();
  const [scores, setScores] = useState<Scores>(EMPTY_SCORES);
  const [feedback, setFeedback] = useState('');
  const [isPending, startTransition] = useTransition();
  const isComplete = COACH_RATING_ITEMS.every((item) => scores[item.key] !== null);

  const handleSubmit = () => {
    const { coaching, friendliness, recommendation } = scores;
    if (coaching === null || friendliness === null || recommendation === null) return;
    startTransition(async () => {
      const result = await submitCoachRating({
        ticketId: target.ticketId,
        coachId: target.coachId,
        scores: { coaching, friendliness, recommendation },
        feedback,
      });
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      showToast('評価を送信しました。ご協力ありがとうございます。', 'success');
      onSubmitted();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold text-ink">コーチの評価にご協力ください</DialogTitle>
        <DialogDescription className="text-xs leading-relaxed text-ink-muted">
          これまでのセッションを振り返って、星1〜5で評価してください。
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-brand-500">
          {target.coachIconPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getProfileIconUrl(target.coachIconPath) ?? ''} alt="" className="h-full w-full object-cover" />
          ) : (
            <GraduationCap size={22} />
          )}
        </div>
        <p className="min-w-0 truncate text-base font-bold text-ink">{target.coachName}</p>
      </div>

      <div className="space-y-4">
        {COACH_RATING_ITEMS.map((item) => (
          <div key={item.key} className="rounded-control bg-canvas p-3">
            <p className="text-sm font-bold text-ink">{item.label}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{item.description}</p>
            <StarRatingInput
              value={scores[item.key]}
              onChange={(value) => setScores((prev) => ({ ...prev, [item.key]: value }))}
              label={item.label}
              getOptionLabel={ratingOptionLabel}
              disabled={isPending}
              className="mt-2"
            />
          </div>
        ))}

        <div>
          <label htmlFor="coach-rating-feedback" className="text-sm font-bold text-ink">
            運営へのコメント（任意）
          </label>
          <p className="mt-0.5 text-xs text-ink-muted">コーチには公開されません。サービスの改善の参考にします。</p>
          <Textarea
            id="coach-rating-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={COACH_RATING_FEEDBACK_MAX_LENGTH}
            rows={4}
            disabled={isPending}
            className="mt-2 rounded-control border-line bg-surface"
          />
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          あとで
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={!isComplete} pending={isPending} icon={<Send size={16} />}>
          送信する
        </Button>
      </DialogFooter>
      <p className="text-center text-[11px] text-ink-subtle">送信した評価はあとから変更できません。</p>
    </>
  );
}
