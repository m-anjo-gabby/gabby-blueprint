'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SprintQuestion } from '@gabby/types/sprint';
import { QuestionCard } from './shared/QuestionCard';
import { SprintPlayControls } from './shared/SprintPlayControls';

interface SprintDrillPlayerProps {
  initialQuestions: SprintQuestion[];
  questionType: '0' | '4' | '5' | '6';
}

export const SprintDrillPlayer: React.FC<SprintDrillPlayerProps> = ({
  initialQuestions,
  questionType,
}) => {
  const router = useRouter();

  // 1. ステート管理（ドリルモードは時間制限なし）
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Speed問題 ('0') 用のランダム音声タイプ（初期化）
  const [speedAnswerType, setSpeedAnswerType] = useState<'yes' | 'no'>(
    () => (Math.random() < 0.5 ? 'yes' : 'no')
  );

  const currentQuestion = initialQuestions[currentIndex];
  const isSpeed = questionType === '0';

  // 終了・完了処理（ドリル全件をやりきった、またはユーザーが明示的に終了した時）
  const handleFinishDrill = () => {
    // 単語帳ドリルの終了お作法に倣い、ライブラリや前の画面に戻す、
    // あるいは達成ダイアログを出すなどの拡張が可能です。ここでは一覧へ戻します。
    router.push('/library');
  };

  // 進む処理 (YES / NO / NEXTボタン共通)
  const handleNext = () => {
    if (currentIndex < initialQuestions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      // 次の問題の判定タイプをランダム決定
      if (isSpeed) {
        setSpeedAnswerType(Math.random() < 0.5 ? 'yes' : 'no');
      }
    } else {
      // 全件終了
      handleFinishDrill();
    }
  };

  // 戻る処理 (BACKボタン)
  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      // 戻ったときもSpeed問題であれば、再度ランダムでyes/noを決定し直す
      if (isSpeed) {
        setSpeedAnswerType(Math.random() < 0.5 ? 'yes' : 'no');
      }
    }
  };

  if (!currentQuestion) return null;

  return (
    <div className="flex flex-col items-center justify-between flex-1 w-full gap-8 my-auto">
      {/* 📖 上部：ドリルモード専用のプログレスバー / カウンター表示 */}
      <div className="flex flex-col items-center gap-2 w-full max-w-md">
        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
          <div 
            className="bg-primary h-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / initialQuestions.length) * 100}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {currentIndex + 1} / {initialQuestions.length} Items
        </p>
      </div>

      {/* 📝 中央：問題カード表示（完全に共通コンポーネントを再利用） */}
      <div className="w-full flex-1 flex items-center justify-center">
        <QuestionCard 
          question={currentQuestion} 
          speedAnswerType={speedAnswerType} 
        />
      </div>

      {/* 🎛️ 下部：操作ボタンコントロール */}
      <div className="w-full pb-6 flex justify-center">
        <SprintPlayControls
          questionType={questionType}
          showBack={currentIndex > 0} // 最初の問題でなければ BACK ボタンを表示する
          onAnswer={handleNext}       // Yes/No/Nextどれが押されてもドリルは進む
          onBack={handleBack}
        />
      </div>
    </div>
  );
};