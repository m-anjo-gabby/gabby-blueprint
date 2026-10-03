/**
 * iOS WebKit のオーディオセッション（navigator.audioSession.type）の唯一の所有者。
 *
 * 以前は再生・録音の各フックや画面がそれぞれ playback ⇄ play-and-record を切り替えていたため、
 * 「前の画面のアンマウント時の playback 復帰（遅延実行を含む）」が「次の画面の play-and-record」より
 * 後に効いてマイクが使えなくなる、発話のたびに出力経路が切り替わり直後の再生がフェードインする、
 * といった不具合の原因になっていた。
 *
 * ここでは「発話セッション」を貸し出し数（リース）で管理する:
 * - 発話を伴う没入画面（単語帳ドリル・スプリント）は表示中ずっと acquireSpeakingSession() で借りる。
 * - 借りただけではセッションを変えない。マイクを一度も使っていない状態で play-and-record にすると
 *   iOS では再生が小さく（受話口寄りに）聞こえるため、最初の発話（またはマイク許可の確認）で
 *   requestPlayAndRecordSession() が呼ばれるまでは playback のまま再生する。
 * - 借りている間に一度 play-and-record に入ったら、画面を離れるまで playback に戻さない
 *   （requestPlaybackSession() を無視する）。問題ごとに出力経路を切り替えず、発話直後の再生のフェードインを防ぐ。
 * - 返却で0件になったら少し待って playback に戻す。待っている間に再び借りられたら取り消す
 *   （リトライ等で前の画面の返却と次の画面の借用が重なっても、次の画面のマイクを奪わない）。
 * - iOS はセッションが playback のままだと getUserMedia を許可ダイアログなしで拒否するため、
 *   マイクを使う直前には必ず requestPlayAndRecordSession() を呼ぶこと。
 */

type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';

interface AudioSessionLike {
  type: AudioSessionType;
}

/** 返却で0件になってから playback に戻すまでの待ち時間（マイクの物理的な解放待ち） */
const RELEASE_RESTORE_DELAY_MS = 300;

let speakingLeases = 0;
/** play-and-record に入っているか（発話セッション中はこの状態を画面を離れるまで保つ） */
let micEngaged = false;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

function getAudioSession(): AudioSessionLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession ?? null;
}

function applySessionType(type: AudioSessionType) {
  const session = getAudioSession();
  if (!session) return;
  try {
    if (session.type !== type) session.type = type;
  } catch (err) {
    console.warn(`Failed to set audioSession type to ${type}:`, err);
  }
}

function cancelPendingRestore() {
  if (restoreTimer) {
    clearTimeout(restoreTimer);
    restoreTimer = null;
  }
}

/**
 * 発話セッションを借りる（借りただけではセッションを変えない）。戻り値の関数で返却する（複数回呼んでも1回分のみ返却）。
 */
export function acquireSpeakingSession(): () => void {
  speakingLeases += 1;
  cancelPendingRestore();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    speakingLeases = Math.max(0, speakingLeases - 1);
    if (speakingLeases > 0) return;
    cancelPendingRestore();
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      if (speakingLeases === 0) {
        micEngaged = false;
        applySessionType('playback');
      }
    }, RELEASE_RESTORE_DELAY_MS);
  };
}

/** 発話セッションを借りている画面があるか */
export function isSpeakingSessionActive(): boolean {
  return speakingLeases > 0;
}

/**
 * 再生モード（playback）を要求する。発話セッション中に一度マイクを使った後は無視する（経路を切り替えない）。
 */
export function requestPlaybackSession() {
  if (speakingLeases > 0 && micEngaged) return;
  cancelPendingRestore();
  micEngaged = false;
  applySessionType('playback');
}

/**
 * 録音再生モード（play-and-record）を要求する。マイクを使う直前（音声認識の開始・getUserMedia の前）に呼ぶ。
 */
export function requestPlayAndRecordSession() {
  cancelPendingRestore();
  micEngaged = true;
  applySessionType('play-and-record');
}
