import { QUESTION_TYPES, SprintQuestionType } from '@gabby/types/sprint';

// getFeedbackConfig / getScoreTier は packages/lib/assessment/feedbackConfig.ts に一元化。
// Word/Sprint双方の発話評価UIから共通参照するため、`@gabby/lib` 経由でも従来通り利用できるよう再エクスポートする。
export { getFeedbackConfig, getScoreTier } from '../assessment/feedbackConfig';

/**
 * 安全な動的教材タイトル生成ヘルパー
 */
export const getSprintTitle = (type: SprintQuestionType | string, level: number, hasLevel?: boolean): string => {
  const typeConfig = QUESTION_TYPES[type as SprintQuestionType];
  const typeLabel = typeConfig ? typeConfig.label : "UG Sprint";
  
  if (hasLevel === false) {
    return typeLabel;
  }
  
  // Level=0の場合は「Lv.」をつけずに「Basic」とする
  if (level === 0) {
    return `${typeLabel} Basic`; // 例: "UG Speed Basic"
  }
  
  return `${typeLabel} Lv.${level}`; // 例: "UG Speed Lv.1"
};

/**
 * OfflineAudioContext を使用して高品質な開始チャイム音を事前レンダリングし、
 * AudioBuffer として生成する共通ヘルパー関数。
 * (マウント時等に一度生成しキャッシュして使い回します)
 */
export const createChimeAudioBuffer = (ctx: AudioContext): Promise<AudioBuffer> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error("AudioContext is only available in browser environment"));
      return;
    }

    const OfflineCtxClass = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!OfflineCtxClass) {
      reject(new Error("OfflineAudioContext is not supported"));
      return;
    }

    const sampleRate = 44100;
    const duration = 0.45;
    const offlineCtx = new OfflineCtxClass(1, Math.ceil(sampleRate * duration), sampleRate);

    // 音 1: E5 (659.25Hz)
    const osc1 = offlineCtx.createOscillator();
    const gain1 = offlineCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 659.25;
    gain1.gain.setValueAtTime(0, 0);
    gain1.gain.linearRampToValueAtTime(0.65, 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.00001, 0.25);
    osc1.connect(gain1);
    gain1.connect(offlineCtx.destination);
    osc1.start(0);
    osc1.stop(0.25);

    // 音 2: B5 (987.77Hz)
    const osc2 = offlineCtx.createOscillator();
    const gain2 = offlineCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 987.77;
    gain2.gain.setValueAtTime(0, 0.10);
    gain2.gain.linearRampToValueAtTime(0.55, 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.00001, 0.45);
    osc2.connect(gain2);
    gain2.connect(offlineCtx.destination);
    osc2.start(0.10);
    osc2.stop(0.45);

    offlineCtx.startRendering()
      .then((renderedBuffer: AudioBuffer) => resolve(renderedBuffer))
      .catch((err: any) => reject(err));
  });
};

/**
 * AudioContext と事前生成された AudioBuffer を使って、
 * 独立チャンネルでチャイム音を再生する共通ヘルパー
 */
export const playChimeBuffer = (ctx: AudioContext, buffer: AudioBuffer): Promise<void> => {
  return new Promise((resolve) => {
    if (!ctx || !buffer) {
      resolve();
      return;
    }
    const doPlay = () => {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      
      // iOSレシーバー出力時の音量減衰をカバーするため、音量を 1.8 倍に増幅
      gainNode.gain.value = 1.8;
      
      source.buffer = buffer;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      source.onended = () => resolve();
      source.start(0);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(doPlay).catch(() => resolve());
    } else {
      doPlay();
    }
  });
};


/**
 * 発話評価対象のテキストから、句読点・記号を除いた単語配列を生成する共通ヘルパー
 */
export const cleanAnswerWords = (text: string): string[] => {
  return text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").split(" ").filter(Boolean);
};

/**
 * デコード済みオーディオバッファのグローバルキャッシュ。
 * 画面遷移をまたいで再フェッチを防ぐため、アプリケーション全体で共有する。
 * キー: Supabase Storage の公開 URL
 */
export const audioBufferCache = new Map<string, AudioBuffer>();

export interface NavigatorWithAudioSession extends Navigator {
  audioSession?: {
    type: 'auto' | 'playback' | 'record' | 'play-and-record';
    categoryOptions?: {
      defaultToSpeaker?: boolean;
      allowBluetooth?: boolean;
      allowBluetoothA2DP?: boolean;
    };
    mode?: 'default' | 'spokenAudio' | 'videoRecording' | 'measurement' | 'voiceChat';
  };
}

/**
 * iOS WebKit用のオーディオセッションを再生モード（playback、スピーカー出力）に安全に切り替える
 */
export const setAudioSessionPlayback = () => {
  if (typeof window === 'undefined') return;
  const nav = navigator as NavigatorWithAudioSession;
  if (nav.audioSession) {
    try {
      if (nav.audioSession.categoryOptions) {
        try { nav.audioSession.categoryOptions.defaultToSpeaker = true; } catch (_) {}
        try { nav.audioSession.categoryOptions.allowBluetooth = true; } catch (_) {}
      }
      nav.audioSession.type = 'playback';
    } catch (err) {
      console.warn("Failed to set audioSession type to playback:", err);
    }
  }
};

/**
 * iOS WebKit用のオーディオセッションを録音再生モード（play-and-record、スピーカー出力）に安全に切り替える
 */
export const setAudioSessionPlayAndRecord = () => {
  if (typeof window === 'undefined') return;
  const nav = navigator as NavigatorWithAudioSession;
  if (nav.audioSession) {
    try {
      if (nav.audioSession.categoryOptions) {
        try { nav.audioSession.categoryOptions.defaultToSpeaker = true; } catch (_) {}
        try { nav.audioSession.categoryOptions.allowBluetooth = true; } catch (_) {}
      }
      try { nav.audioSession.mode = 'voiceChat'; } catch (_) {}
      nav.audioSession.type = 'play-and-record';
    } catch (err) {
      console.warn("Failed to set audioSession type to play-and-record:", err);
    }
  }
};