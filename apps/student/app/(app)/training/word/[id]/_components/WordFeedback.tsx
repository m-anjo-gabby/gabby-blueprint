'use client';

import React from 'react';
import { type AnalysisResult, type FeedbackConfig } from '@gabby/types/speechAssessment';
import { SpeechFeedbackModal } from '@/components/common/SpeechFeedbackModal';

interface WordFeedbackProps {
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;
  onClose: () => void;
}

export function WordFeedback(props: WordFeedbackProps) {
  return <SpeechFeedbackModal {...props} variant="word" title="発話の分析" adviceTitle="改善のヒント" interactive />;
}
