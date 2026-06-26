import { FeedbackConfig } from '@gabby/types/speechAssessment';
import { QUESTION_TYPES, SprintQuestionType } from '@gabby/types/sprint';

/**
 * 安全な動的教材タイトル生成ヘルパー
 */
export const getSprintTitle = (type: SprintQuestionType | string, level: number): string => {
  const typeConfig = QUESTION_TYPES[type as SprintQuestionType];
  const typeLabel = typeConfig ? typeConfig.label : "UG Sprint";
  
  // Level=0の場合は「Lv.」をつけずに「Basic」とする
  if (level === 0) {
    return `${typeLabel} Basic`; // 例: "UG Speed Basic"
  }
  
  return `${typeLabel} Lv.${level}`; // 例: "UG Speed Lv.1"
};

/**
 * 発話評価のフィードバックスコア設定取得
 * @param score - 発話スコア (0-1)
 * @returns フィードバック設定
 */
export const getFeedbackConfig = (score: number): FeedbackConfig => {
  if (score >= 0.90) return { fill: '#10B981', tagText: 'Excellent' };
  if (score >= 0.80) return { fill: '#3B82F6', tagText: 'Great' };
  if (score >= 0.60) return { fill: '#F59E0B', tagText: 'Good' };
  if (score >= 0.30) return { fill: '#F97316', tagText: 'Fair' };
  return { fill: '#EF4444', tagText: 'Poor' };
};

/**
 * 発話開始時のチャイム音を再生する関数
 */
export const playStartSound = () => {
  try {
    const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
    if (!AudioContextClass) return;
    
    const audioCtx = new AudioContextClass();
    
    // ブラウザの自動再生ポリシー（ブラウザ制限）対策
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // -------------------------------------------------------------
    // 1音目: 少し低めの心地よい音 (E5: 約659Hz / ミの音)
    // -------------------------------------------------------------
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    
    // 音量の設定
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.15, now + 0.02); // 20msかけて最大音量0.15まで立ち上げる（クリックノイズ防止）
    gain1.gain.exponentialRampToValueAtTime(0.00001, now + 0.20); // 200msかけてなだらかに消音
    
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.20);

    // -------------------------------------------------------------
    // 2音目: 50ms遅らせて鳴らす高い音 (B5: 約988Hz / シの音)
    // -------------------------------------------------------------
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.05); // 1音目から50ms（0.05秒）遅らせる
    
    // 音量の設定
    gain2.gain.setValueAtTime(0, now + 0.05);
    gain2.gain.linearRampToValueAtTime(0.12, now + 0.07); // 20msかけて最大音量0.12まで立ち上げる
    gain2.gain.exponentialRampToValueAtTime(0.00001, now + 0.25); // 1音目の終わりと揃えるように減衰
    
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    
    osc2.start(now + 0.05);
    osc2.stop(now + 0.25);

  } catch (e) {
    console.error("Failed to play start sound:", e);
  }
};