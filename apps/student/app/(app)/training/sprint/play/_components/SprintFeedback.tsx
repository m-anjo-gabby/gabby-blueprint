'use client';

import React from 'react';
import { type AnalysisResult, type FeedbackConfig } from '@gabby/types/speechAssessment';
import { SpeechFeedbackModal } from '@/components/common/SpeechFeedbackModal';

interface SprintFeedbackProps {
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;
  onClose: () => void;
}

export function SprintFeedback(props: SprintFeedbackProps) {
  return (
    <SpeechFeedbackModal
      {...props}
      variant="sprint"
      title="発話の分析"
      adviceTitle="改善のヒント"
      interactive={false}
    />
  );
}
