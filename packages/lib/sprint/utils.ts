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
 * AudioBuffer を WAV 形式の ArrayBuffer に変換するユーティリティ関数。
 * OfflineAudioContext で事前レンダリングしたチャイム音を
 * HTMLAudioElement で再生できる Blob URL に変換するために使用します。
 */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const totalSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF/WAVE ヘッダー
  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);   // fmt チャンクサイズ (PCM = 16)
  view.setUint16(20, 1, true);    // PCM フォーマット
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM サンプルデータ書き込み（16bit signed little-endian）
  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return arrayBuffer;
}

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