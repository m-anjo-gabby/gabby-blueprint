'use client';

import React from 'react';
import { AnalysisResult, FeedbackConfig } from '@gabby/types/speechAssessment';
import { SpeechFeedbackModal } from '@/components/common/SpeechFeedbackModal';

interface SprintFeedbackProps {
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;
  onClose: () => void;
}

export const SprintFeedback: React.FC<SprintFeedbackProps> = (props) => (
  <SpeechFeedbackModal
    {...props}
    variant="sprint"
    title="Sprint Analysis"
    adviceTitle="Analysis Result"
    interactive={false}
  />
);
