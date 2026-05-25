'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

interface SprintPlayControlsProps {
  questionType: '0' | '4' | '5' | '6';
  showBack?: boolean;
  onAnswer?: (choice: 'yes' | 'no' | 'next') => void;
  onBack?: () => void;
  disabled?: boolean;
}

export const SprintPlayControls: React.FC<SprintPlayControlsProps> = ({
  questionType,
  showBack = false,
  onAnswer,
  onBack,
  disabled = false,
}) => {
  // Speed問題 ('0') の場合は YES / NO ボタンを表示
  if (questionType === '0') {
    return (
      <div className="flex w-full max-w-md items-center justify-center gap-6 px-4">
        <Button
          variant="outline"
          size="lg"
          onClick={() => onAnswer?.('no')}
          disabled={disabled}
          className="flex-1 h-16 border-2 border-destructive text-destructive hover:bg-destructive/10 text-xl font-bold gap-2 rounded-2xl"
        >
          <X className="w-6 h-6" />
          NO
        </Button>
        <Button
          variant="default"
          size="lg"
          onClick={() => onAnswer?.('yes')}
          disabled={disabled}
          className="flex-1 h-16 bg-primary hover:bg-primary/90 text-primary-foreground text-xl font-bold gap-2 rounded-2xl shadow-lg"
        >
          <Check className="w-6 h-6" />
          YES
        </Button>
      </div>
    );
  }

  // Structure, Builders, Mastery ('4','5','6') の場合は NEXT (および BACK) ボタンを表示
  return (
    <div className="flex w-full max-w-md items-center justify-center gap-4 px-4">
      {showBack && (
        <Button
          variant="ghost"
          size="lg"
          onClick={onBack}
          disabled={disabled}
          className="h-14 px-6 border rounded-xl"
        >
          <ArrowLeft className="w-5 h-5 mr-1" />
          BACK
        </Button>
      )}
      <Button
        variant="default"
        size="lg"
        onClick={() => onAnswer?.('next')}
        disabled={disabled}
        className="flex-1 h-14 bg-primary text-xl font-bold gap-2 rounded-xl shadow-md"
      >
        NEXT
        <ArrowRight className="w-5 h-5" />
      </Button>
    </div>
  );
};