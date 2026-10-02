import { QUESTION_TYPES, SprintQuestionType, type SprintAvailableLevels } from '@gabby/types/sprint';
import type { MetadataSprint } from '@gabby/types/content';
import type { StudentSprintProgress } from '@gabby/types/coachStudent';

/**
 * 教材メタデータから「レベル概念を持つか」を判定する共通ヘルパー。
 * コーパススプリント（sprint_type: '1'）のみ has_level フラグに従い、
 * 汎用スプリント（'0'）や未取得時は常に true として扱う。
 * SprintDrillPlayer/SprintTimePlayer/SprintSelect/結果画面など、
 * courseTitle 算出のために各所で個別に再実装されていたロジックを集約したもの。
 */
export const resolveSprintHasLevel = (metadata: Pick<MetadataSprint, 'sprint_type' | 'has_level'> | null | undefined): boolean => {
  const isCorpus = metadata?.sprint_type === '1';
  return isCorpus ? metadata?.has_level ?? true : true;
};

/**
 * 生徒が自主トレで選べるレベルかを判定する共通ヘルパー（選択画面の鍵表示とサーバー側の検証で共有）。
 * レベル管理あり（level_managed=true）の生徒は「到達レベル＋1」まで（最小レベルは常に可）、
 * レベル管理なしの生徒は全レベルを選択できる。進捗行が無い場合はレベル管理あり・到達レベル0として扱う。
 */
export const isSprintLevelSelectable = (
  type: SprintQuestionType,
  level: number,
  progress: Partial<Pick<StudentSprintProgress, 'level_speed' | 'level_structure' | 'level_builders' | 'level_mastery' | 'level_managed'>> | null | undefined
): boolean => {
  const meta = QUESTION_TYPES[type];
  if (!meta) return false;
  if (level < meta.minLevel || level > meta.maxLevel) return false;
  if (progress?.level_managed === false) return true;
  const clearedLevel = progress?.[meta.dbKey as keyof typeof progress];
  return level <= meta.minLevel || level <= (typeof clearedLevel === 'number' ? clearedLevel : 0) + 1;
};

/**
 * 指定した種別に問題が1件でもあるか。availableLevels が null（未取得・取得失敗）の場合は絞り込まず true。
 */
export const hasSprintQuestionsForType = (
  availableLevels: SprintAvailableLevels | null | undefined,
  type: SprintQuestionType
): boolean => {
  if (!availableLevels) return true;
  return (availableLevels[type]?.length ?? 0) > 0;
};

/**
 * 指定した種別・レベルに問題があるか。availableLevels が null（未取得・取得失敗）の場合は絞り込まず true。
 */
export const isSprintLevelAvailable = (
  availableLevels: SprintAvailableLevels | null | undefined,
  type: SprintQuestionType,
  level: number
): boolean => {
  if (!availableLevels) return true;
  return availableLevels[type]?.includes(level) ?? false;
};

/**
 * 種別を選んだときに選択するレベルを決める共通ヘルパー（生徒の選択画面・コーチのLive Sprint設定画面で共有）。
 * - レベルの無い教材は常に1
 * - preferred（前回の設定等）が「問題あり かつ 選択可」ならそれを維持
 * - それ以外は「問題あり かつ 選択可」の最も低いレベル
 * - 該当が無ければ（すべて未到達等）、問題のある最も低いレベル → 種別の最小レベルの順にフォールバック
 */
export const pickSprintLevel = (
  type: SprintQuestionType,
  options: {
    hasLevel: boolean;
    availableLevels: SprintAvailableLevels | null | undefined;
    isSelectable?: (level: number) => boolean;
    preferred?: number | null;
  }
): number => {
  if (!options.hasLevel) return 1;
  const meta = QUESTION_TYPES[type];
  const isSelectable = options.isSelectable ?? (() => true);
  const candidates: number[] = [];
  for (let lv = meta.minLevel; lv <= meta.maxLevel; lv++) {
    if (isSprintLevelAvailable(options.availableLevels, type, lv) && isSelectable(lv)) candidates.push(lv);
  }
  if (options.preferred != null && candidates.includes(options.preferred)) return options.preferred;
  if (candidates.length > 0) return candidates[0];
  return options.availableLevels?.[type]?.[0] ?? meta.minLevel;
};

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
 * レベルのみの表示ラベルを生成する共通ヘルパー（種別名は含まない）。
 * Level=0かつBasicレベルを持つ種別の場合のみ「Basic」、それ以外は「Lv.X」。
 * Setup/Player/結果画面/生徒概要など、レベル単体で表示する箇所の表記揺れを防ぐために使用する。
 */
export const formatSprintLevelLabel = (type: SprintQuestionType | string, level: number): string => {
  const typeConfig = QUESTION_TYPES[type as SprintQuestionType];
  if (level === 0 && typeConfig?.hasBasic) {
    return 'Basic';
  }
  return `Lv.${level}`;
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