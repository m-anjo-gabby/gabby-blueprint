'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SprintQuestion } from '@gabby/types/sprint';
import { QuestionCard } from './shared/QuestionCard';
import { SprintTimer } from './shared/SprintTimer';
import { SprintPlayControls } from './shared/SprintPlayControls';

const TOTAL_DURATION_SECONDS = 150;

interface SprintTimePlayerProps {
  initialQuestions: SprintQuestion[];
  questionType: '0' | '4' | '5' | '6';
}

export const SprintTimePlayer: React.FC<SprintTimePlayerProps> = ({
  initialQuestions,
  questionType,
}) => {
  const router = useRouter();

  // 1. ステート管理
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TOTAL_DURATION_SECONDS);
  const [speedAnswerType, setSpeedAnswerType] = useState<'yes' | 'no'>(() => (Math.random() < 0.5 ? 'yes' : 'no'));
  const [results, setResults] = useState<{ questionId: string; isCorrect: boolean }[]>([]);

  const currentQuestion = initialQuestions[currentIndex];
  const isSpeed = questionType === '0';

  // 🚀 【修正ポイント】関数オブジェクトの宣言を useEffect よりも上に配置してTDZを回避

  // 終了処理
  const handleFinishSprint = (finalResults = results) => {
    const finalScore = {
      questionType,
      totalQuestions: initialQuestions.length,
      correctCount: finalResults.filter(r => r.isCorrect).length,
      results: finalResults,
    };
    sessionStorage.setItem('gabby_sprint_last_result', JSON.stringify(finalScore));
    router.push('/training/sprint/result');
  };

  // ユーザーのアクションハンドラー
  const handleAnswer = (choice: 'yes' | 'no' | 'next') => {
    if (!currentQuestion) return;

    let isCorrect = true;
    if (isSpeed) {
      isCorrect = choice === speedAnswerType;
    }

    const newResult = { questionId: currentQuestion.question_id, isCorrect };
    const updatedResults = [...results, newResult];
    setResults(updatedResults);

    if (currentIndex < initialQuestions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      // 次の問題の判定タイプをこのタイミングで決定する (レンダリングの不整合を防ぐ)
      if (isSpeed) {
        setSpeedAnswerType(Math.random() < 0.5 ? 'yes' : 'no');
      }
    } else {
      handleFinishSprint(updatedResults);
    }
  };
  // 3. 全体カウントダウンタイマーのライフサイクル
  useEffect(() => {
    if (timeLeft <= 0) {
      handleFinishSprint();
      return;
    }

    const timerId = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft]);

  if (!currentQuestion) return null;

  return (
    <div className="flex flex-col items-center justify-between flex-1 w-full gap-8 my-auto">
      <div className="flex flex-col items-center gap-2">
        <SprintTimer currentSeconds={timeLeft} totalSeconds={TOTAL_DURATION_SECONDS} size={100} />
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {currentIndex + 1} / {initialQuestions.length} Questions
        </p>
      </div>

      <div className="w-full flex-1 flex items-center justify-center">
        <QuestionCard 
          question={currentQuestion} 
          speedAnswerType={speedAnswerType} 
        />
      </div>

      <div className="w-full pb-6 flex justify-center">
        <SprintPlayControls
          questionType={questionType}
          showBack={false}
          onAnswer={handleAnswer}
        />
      </div>
    </div>
  );
};