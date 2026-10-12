'use client';

import React from 'react';
import { AnalysisResult, FeedbackConfig } from '@gabby/types/speechAssessment';
import { SpeechFeedbackModal } from '@/components/common/SpeechFeedbackModal';

interface WordFeedbackProps {
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;
  onClose: () => void;
}

export const WordFeedback: React.FC<WordFeedbackProps> = (props) => (
  <SpeechFeedbackModal
    {...props}
    variant="word"
    title="発話の分析"
    adviceTitle="改善のヒント"
    interactive
  />
);
