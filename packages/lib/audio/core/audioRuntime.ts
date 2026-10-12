/**
 * アプリ全体で1つだけ持つ音声再生の基盤（React に依存しない）。
 *
 * - AudioContext はアプリ全体で1つ。画面を離れても閉じず、自動では作り直さない。
 *   以前はフック・画面ごとに AudioContext を作り、閉じないものもあったため、
 *   「スプリント→結果→リトライ」等の繰り返しで iOS の同時保持数の上限に達し、再生できなくなることがあった。
 * - 再生中の音声（クリップ）は常に1つ。新しいクリップを再生すると前のクリップは止まる。
 * - 音声再開の状態（resumeStatus）もここで一元管理し、各画面は subscribe で購読する。
 *
 * ## 中断と復旧（iOS の放置・バックグラウンド・通話等）
 * - 画面が隠れたら、再生を止めて自分から suspend() し、「中断」を通知する（各プレイヤーは流れ・発話を止めてマイクを放す）。
 *   iOS に止められる前に止めておくと、戻ったときに再開しやすい。
 * - 画面に戻ったら、まず resume() を試す。動き出し、かつ再生位置（currentTime）が進めば「復旧」を通知する
 *   （各プレイヤーは中断した問題を頭からやり直す）。だめなら「タップして再開」（needsResume）を出す。
 * - iOS は状態が running なのに無音（再生位置が進まない）になることがあるため、中断の後は状態だけでなく
 *   再生位置が進むかで判定する。タップでの再開では、壊れたコンテキストをその場で作り直す
 *   （iOS はタップの同期コールスタック内で作ったコンテキストしか確実にアンロックしないため）。
 * - 動いていないコンテキストでは再生を始めず、すぐ「中断」で返す（終わらない待ちで画面の流れが止まらないようにする）。
 *   再生中も、音声の長さ＋余裕の時間で必ず打ち切る。
 * - タップしても復旧しなければ 'failed'（再読み込みを案内）。再読み込みした同じ画面でまた失敗した場合は
 *   'failedAgain'（Safari のタブを閉じて開き直すよう案内）。タブ側の音声処理が壊れていると再読み込みでは直らないため。
 */

import type { LogEventName } from '../../logger';
import { clientLogger } from '../../logger/client';

/**
 * 'ok': 通常状態。
 * 'needsResume': 中断から自動では復旧できなかった。「タップして音声を再開」を出す。
 * 'failed': タップでの再開でも復旧しなかった。再読み込みを案内する。
 * 'failedAgain': 再読み込みした同じ画面でまた復旧しなかった。Safari のタブを閉じて開き直すよう案内する。
 */
export type AudioResumeStatus = 'ok' | 'needsResume' | 'failed' | 'failedAgain';

/** 'interrupted': 再生・発話を続けられなくなった（流れを止める）。'recovered': 中断から復旧した（中断した所からやり直す） */
export type AudioLifecycleEvent = 'interrupted' | 'recovered';

/** クリップの終わり方。'interrupted' は音声が出せない・出ていない状態で打ち切ったもの */
export type PlayClipResult = 'ended' | 'stopped' | 'interrupted';

export interface AudioDiagnosticEvent {
  event: LogEventName;
  level: 'info' | 'warn';
  detail: Record<string, unknown>;
}

const RESUME_TIMEOUT_MS = 500;
/** 再生位置が進むかを確かめる時間 */
const HEALTH_CHECK_MS = 300;
/** クリップの打ち切りタイマーの余裕（音声の長さに足す） */
const CLIP_WATCHDOG_EXTRA_MS = 2000;
/** 再読み込み後の「また失敗した」を判定する記録（タブごと・再読み込みでは消えない） */
const FAILURE_STORAGE_KEY = 'gabby:audio-failed';
const FAILURE_REPEAT_WINDOW_MS = 30 * 60 * 1000;

let ctx: AudioContext | null = null;
/** 一度でも running になったか（初回のタップ前の suspended は「要復旧」ではないため区別する） */
let hasEverRun = false;
/** 中断の後で、再生位置が進むかをまだ確かめていない（running でも無音のことがあるため） */
let needsHealthCheck = false;
/** 画面が隠れたときに自分で suspend した（その statechange を中断として扱わない） */
let suspendedByUs = false;
/** 中断を通知したが、まだ復旧を通知していない */
let interruptionPending = false;
let hiddenAt: number | null = null;
let lifecycleInstalled = false;
let resumeStatus: AudioResumeStatus = 'ok';
const statusListeners = new Set<() => void>();
const lifecycleListeners = new Set<(event: AudioLifecycleEvent) => void>();
let diagnosticsReporter: ((event: AudioDiagnosticEvent) => void) | null = null;

/** デコード済み音声のキャッシュ（AudioBuffer はコンテキストを作り直しても使い回せる）。キー: 公開URL */
const bufferCache = new Map<string, AudioBuffer>();
const inflightLoads = new Map<string, Promise<AudioBuffer>>();

let chimeBuffer: AudioBuffer | null = null;
let chimePromise: Promise<AudioBuffer | null> | null = null;

interface ActiveClip {
  source: AudioBufferSourceNode;
  ownerId: number;
  /** 再生を終えた扱いにして待っている Promise を解決する（停止・終了・中断のいずれでも1回だけ） */
  finish: (result: PlayClipResult) => void;
}
let activeClip: ActiveClip | null = null;

let nextOwnerId = 1;
/** 再生の持ち主（フックのインスタンス）ごとのID。アンマウント時に自分のクリップだけを止めるために使う */
export function createAudioOwnerId(): number {
  return nextOwnerId++;
}

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    || null;
}

/**
 * running 以外を「要復旧」とみなす。WebKit は標準外の 'interrupted' を返すことがあるため、
 * 個別の状態値ではなく running かどうかだけを見る（引数を string で受けて誤った narrowing を防ぐ）。
 */
function isRunning(state: string): boolean {
  return state === 'running';
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── 記録（発生状況の把握用。送り先はアプリが setAudioDiagnosticsReporter で登録する） ───

/** 中断・復旧の記録の送り先を登録する（アプリで1回） */
export function setAudioDiagnosticsReporter(reporter: ((event: AudioDiagnosticEvent) => void) | null) {
  diagnosticsReporter = reporter;
}

function report(event: LogEventName, level: 'info' | 'warn', detail: Record<string, unknown> = {}) {
  if (!diagnosticsReporter || typeof window === 'undefined') return;
  try {
    diagnosticsReporter({
      event,
      level,
      detail: {
        ...detail,
        contextState: ctx?.state ?? null,
        sampleRate: ctx?.sampleRate ?? null,
        visibility: document.visibilityState,
        hiddenMs: hiddenAt !== null ? Date.now() - hiddenAt : null,
        path: window.location.pathname,
        userAgent: navigator.userAgent,
      },
    });
  } catch { /* 記録の失敗は再生に影響させない */ }
}

// ─── 音声再開の状態 ─────────────────────────────────────────────

function setResumeStatus(next: AudioResumeStatus) {
  if (resumeStatus === next) return;
  resumeStatus = next;
  statusListeners.forEach((listener) => listener());
}

export function getAudioResumeStatus(): AudioResumeStatus {
  return resumeStatus;
}

export function subscribeAudioResumeStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

/** 中断・復旧の通知を受け取る */
export function subscribeAudioLifecycle(listener: (event: AudioLifecycleEvent) => void): () => void {
  lifecycleListeners.add(listener);
  return () => { lifecycleListeners.delete(listener); };
}

function emitLifecycle(event: AudioLifecycleEvent) {
  lifecycleListeners.forEach((listener) => {
    try { listener(event); } catch (e) { clientLogger.warn('audio:lifecycle_listener_failed', 'Audio lifecycle listener failed', { err: e }); }
  });
}

/** 再読み込み後も同じ画面で失敗したか（sessionStorage はタブごとで、再読み込みでは消えない） */
function markFailed(reason: string) {
  let repeated = false;
  try {
    const raw = window.sessionStorage.getItem(FAILURE_STORAGE_KEY);
    const previous = raw ? (JSON.parse(raw) as { path?: string; at?: number }) : null;
    repeated = !!previous && previous.path === window.location.pathname
      && typeof previous.at === 'number' && Date.now() - previous.at < FAILURE_REPEAT_WINDOW_MS;
    window.sessionStorage.setItem(FAILURE_STORAGE_KEY, JSON.stringify({ path: window.location.pathname, at: Date.now() }));
  } catch { /* 保存できない環境では「また失敗」を判定しない */ }
  setResumeStatus(repeated ? 'failedAgain' : 'failed');
  report(repeated ? 'audio:recover_failed_again' : 'audio:recover_failed', 'warn', { reason });
}

function clearFailureMark() {
  try { window.sessionStorage.removeItem(FAILURE_STORAGE_KEY); } catch { /* no-op */ }
}

/** 再生・発話を続けられなくなった。再生を止め、各プレイヤーに流れを止めさせる */
function interrupt(reason: string) {
  stopActiveClip('interrupted');
  needsHealthCheck = true;
  if (!interruptionPending) {
    interruptionPending = true;
    emitLifecycle('interrupted');
  }
  // 画面が隠れただけの中断はタブの切り替えのたびに起きるため記録しない（戻ったときに直らなければ resume_needed を記録する）
  if (reason !== 'hidden') report('audio:interrupted', 'info', { reason });
}

/** 復旧した。状態を戻し、中断していた場合は各プレイヤーにやり直させる */
function recovered(method: string) {
  needsHealthCheck = false;
  hasEverRun = true;
  clearFailureMark();
  const wasBroken = resumeStatus !== 'ok';
  setResumeStatus('ok');
  if (interruptionPending) {
    interruptionPending = false;
    emitLifecycle('recovered');
  }
  if (wasBroken || method !== 'auto') report('audio:recovered', 'info', { method });
}

// ─── AudioContext ──────────────────────────────────────────────

function createContext(): AudioContext | null {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return null;
  const created = new AudioContextClass();
  created.onstatechange = () => handleStateChange(created);
  ctx = created;
  installLifecycle();
  return created;
}

/** 共有の AudioContext を返す（無ければ作る）。状態は変えない */
export function getAudioContext(): AudioContext | null {
  if (ctx && ctx.state !== 'closed') return ctx;
  return createContext();
}

function resumeWithTimeout(context: AudioContext): Promise<void> {
  suspendedByUs = false;
  return Promise.race([
    context.resume(),
    new Promise<void>((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS)),
  ]).catch(() => { /* no-op */ });
}

/** running で、かつ再生位置が進んでいるか（iOS は running なのに無音のことがある） */
async function isAdvancing(context: AudioContext): Promise<boolean> {
  if (!isRunning(context.state)) return false;
  const startedAt = context.currentTime;
  await wait(HEALTH_CHECK_MS);
  return isRunning(context.state) && context.currentTime > startedAt;
}

/** タップによらずに復旧を試す（resume → 再生位置の確認）。作り直しはしない */
async function tryRecoverWithoutGesture(context: AudioContext, method: string): Promise<boolean> {
  if (!isRunning(context.state)) await resumeWithTimeout(context);
  if (context !== ctx) return false;
  if (await isAdvancing(context)) {
    recovered(method);
    return true;
  }
  return false;
}

function handleStateChange(context: AudioContext) {
  if (context !== ctx) return;
  if (isRunning(context.state)) {
    hasEverRun = true;
    // 通話の終了等で iOS が自動で再開した場合。再生位置が進むことを確かめてから復旧とする
    if (resumeStatus === 'needsResume' && document.visibilityState === 'visible') {
      void tryRecoverWithoutGesture(context, 'statechange');
    }
    return;
  }
  if (context.state === 'closed' || suspendedByUs || !hasEverRun) return;
  // 画面表示中に止められた（通話・Siri・他のアプリの音声等）
  interrupt(`statechange:${context.state}`);
  setResumeStatus('needsResume');
}

// ─── 画面の表示・非表示 ─────────────────────────────────────────

function handleHidden() {
  if (hiddenAt === null) hiddenAt = Date.now();
  const context = ctx;
  if (!context || !hasEverRun) return;
  interrupt('hidden');
  if (isRunning(context.state)) {
    suspendedByUs = true;
    context.suspend().catch(() => { /* no-op */ });
  }
}

function handleVisible() {
  const context = ctx;
  const hiddenMs = hiddenAt !== null ? Date.now() - hiddenAt : null;
  hiddenAt = null;
  if (!context || !hasEverRun || !interruptionPending || resumeStatus === 'failed' || resumeStatus === 'failedAgain') return;
  void tryRecoverWithoutGesture(context, 'auto').then((ok) => {
    if (ok || context !== ctx) return;
    setResumeStatus('needsResume');
    report('audio:resume_needed', 'warn', { reason: 'visible', awayMs: hiddenMs });
  });
}

function installLifecycle() {
  if (lifecycleInstalled || typeof document === 'undefined') return;
  lifecycleInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handleHidden();
    else handleVisible();
  });
  window.addEventListener('pagehide', handleHidden);
  window.addEventListener('pageshow', () => {
    if (document.visibilityState === 'visible') handleVisible();
  });
}

/**
 * 再生・チャイム等、タップ起点とは限らない処理から呼ぶ。再生に使えるコンテキストを返し、使えなければ null。
 * resume を試すだけで作り直さない。中断の後は再生位置が進むことも確かめる。
 */
export async function ensureAudioRunning(): Promise<AudioContext | null> {
  const context = getAudioContext();
  if (!context) return null;
  if (resumeStatus === 'failed' || resumeStatus === 'failedAgain') return null;
  if (isRunning(context.state) && !needsHealthCheck) {
    hasEverRun = true;
    return context;
  }
  if (!hasEverRun) {
    // まだ一度も動いていない（iOS の自動再生ロック中）。resume を試し、だめなら「タップして再開」を出して流れを止める
    // （タップでのアンロック後に recovered を通知し、止めた所からやり直させる）
    await resumeWithTimeout(context);
    if (isRunning(context.state)) {
      hasEverRun = true;
      return context;
    }
    if (context === ctx) {
      interrupt('locked');
      setResumeStatus('needsResume');
    }
    return null;
  }
  if (await tryRecoverWithoutGesture(context, 'play')) return context;
  if (context === ctx) {
    interrupt('not-running-on-play');
    setResumeStatus('needsResume');
    report('audio:resume_needed', 'warn', { reason: 'play' });
  }
  return null;
}

/** 1サンプルの無音を鳴らして出力を有効化する（iOS のタップ起点のアンロック用） */
function playSilentTick(context: AudioContext) {
  try {
    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
  } catch { /* no-op */ }
}

/**
 * 利用者のタップから呼ぶ。await より前の同期区間で、中断の後なら壊れたコンテキストをその場で作り直す。
 * それでも復旧しなければ 'failed'（再読み込みを案内）、再読み込み後もなら 'failedAgain' にする。
 */
export async function unlockAudio(): Promise<void> {
  let context = getAudioContext();
  if (!context) return;

  const isRecovery = hasEverRun && (needsHealthCheck || resumeStatus !== 'ok' || !isRunning(context.state));
  if (!isRecovery) {
    if (isRunning(context.state)) {
      hasEverRun = true;
      return;
    }
    // 初回のアンロック（自動再生ロックの解除）
    playSilentTick(context);
    await resumeWithTimeout(context);
    if (isRunning(context.state)) {
      hasEverRun = true;
      // ロック中に再生しようとして止めた流れがあれば、やり直させる
      if (interruptionPending || resumeStatus !== 'ok') recovered('unlock');
    }
    return;
  }

  // 一度動いていたコンテキストが中断された（バックグラウンド復帰・通話等）。
  // iOS では resume が効かない・running でも無音のことが多いため、タップの同期区間で作り直す（古いものは必ず閉じ、数を増やさない）。
  stopActiveClip('interrupted');
  const old = context;
  context = createContext();
  old.close().catch(() => { /* no-op */ });
  if (!context) return;

  playSilentTick(context);
  await resumeWithTimeout(context);

  if (context === ctx && (await isAdvancing(context))) {
    recovered('gesture');
  } else if (context === ctx) {
    markFailed('gesture-recreate');
  }
}

function stopActiveClip(result: PlayClipResult = 'stopped') {
  const clip = activeClip;
  if (!clip) return;
  activeClip = null;
  try { clip.source.stop(); } catch { /* no-op */ }
  clip.finish(result);
}

/**
 * 再生中のクリップを止める。ownerId を渡した場合は、その持ち主のクリップのときだけ止める。
 */
export function stopAudioClip(ownerId?: number) {
  if (!activeClip) return;
  if (ownerId !== undefined && activeClip.ownerId !== ownerId) return;
  stopActiveClip('stopped');
}

/** 再生中のクリップの再生速度を変える */
export function setAudioClipRate(rate: number) {
  if (!activeClip) return;
  try { activeClip.source.playbackRate.value = rate; } catch { /* no-op */ }
}

export function hasCachedAudioBuffer(url: string): boolean {
  return bufferCache.has(url);
}

/**
 * 音声ファイルを取得・デコードする（キャッシュ・同時取得のまとめ込みあり）。
 */
export function loadAudioBuffer(url: string, opts: { decodeTimeoutMs?: number } = {}): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return Promise.resolve(cached);
  const inflight = inflightLoads.get(url);
  if (inflight) return inflight;

  const load = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const context = getAudioContext();
    if (!context) throw new Error('AudioContext is not available');
    const decode = context.decodeAudioData(arrayBuffer);
    const decoded = opts.decodeTimeoutMs
      ? await Promise.race([
          decode,
          new Promise<AudioBuffer>((_, reject) => setTimeout(() => reject(new Error('decodeAudioData timeout')), opts.decodeTimeoutMs)),
        ])
      : await decode;
    bufferCache.set(url, decoded);
    return decoded;
  })();

  inflightLoads.set(url, load);
  load.then(
    () => { inflightLoads.delete(url); },
    () => { inflightLoads.delete(url); },
  );
  return load;
}

/**
 * デコード済みの音声をクリップとして再生する。前のクリップは止める。
 * 再生に使えるコンテキストが無ければ再生せず 'interrupted' で返す。
 * 再生が終わらない（無音のまま止まっている）場合は、音声の長さ＋余裕の時間で 'interrupted' として打ち切る。
 */
export async function playAudioClip(
  buffer: AudioBuffer,
  opts: { ownerId: number; playbackRate?: number; onStart?: () => void },
): Promise<PlayClipResult> {
  const context = await ensureAudioRunning();
  if (!context || context.state === 'closed') return 'interrupted';

  stopActiveClip('stopped');

  return new Promise<PlayClipResult>((resolve) => {
    const source = context.createBufferSource();
    const rate = opts.playbackRate ?? 1.0;
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(context.destination);

    let finished = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const clip: ActiveClip = {
      source,
      ownerId: opts.ownerId,
      finish: (result) => {
        if (finished) return;
        finished = true;
        if (watchdog) clearTimeout(watchdog);
        resolve(result);
      },
    };
    source.onended = () => {
      if (activeClip === clip) activeClip = null;
      clip.finish('ended');
    };
    activeClip = clip;
    opts.onStart?.();

    try {
      source.start(0);
    } catch (err) {
      clientLogger.error('audio:clip_start_failed', 'AudioSource start failed', { err });
      if (activeClip === clip) activeClip = null;
      clip.finish('interrupted');
      return;
    }

    // 再生中に速度を下げられても足りるよう、0.5倍速（より遅ければその速度）を想定した長さに余裕を足す
    const expectedMs = (buffer.duration / Math.min(rate, 0.5)) * 1000;
    watchdog = setTimeout(() => {
      if (activeClip !== clip) return;
      report('audio:clip_watchdog', 'warn', { durationSec: buffer.duration, rate });
      interrupt('clip-watchdog');
      setResumeStatus('needsResume');
    }, expectedMs + CLIP_WATCHDOG_EXTRA_MS);
  });
}

/**
 * OfflineAudioContext で開始チャイム（E5→B5）を事前レンダリングする（アプリ全体で1回）。
 */
function getChimeBuffer(): Promise<AudioBuffer | null> {
  if (chimeBuffer) return Promise.resolve(chimeBuffer);
  if (chimePromise) return chimePromise;
  if (typeof window === 'undefined') return Promise.resolve(null);

  const OfflineCtxClass = window.OfflineAudioContext
    || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineCtxClass) return Promise.resolve(null);

  const sampleRate = 44100;
  const duration = 0.45;
  const offlineCtx = new OfflineCtxClass(1, Math.ceil(sampleRate * duration), sampleRate);

  const tone = (frequency: number, startAt: number, peak: number, endAt: number) => {
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.00001, endAt);
    osc.connect(gain);
    gain.connect(offlineCtx.destination);
    osc.start(startAt);
    osc.stop(endAt);
  };
  tone(659.25, 0, 0.65, 0.25);    // E5
  tone(987.77, 0.10, 0.55, 0.45); // B5

  chimePromise = offlineCtx.startRendering()
    .then((rendered) => {
      chimeBuffer = rendered;
      return rendered;
    })
    .catch((e: unknown) => {
      clientLogger.warn('audio:chime_render_failed', 'Chime pre-render failed', { err: e });
      chimePromise = null;
      return null;
    });
  return chimePromise;
}

/** チャイムを事前に用意しておく（再生直前のレンダリング待ちを避ける） */
export function prepareChime() {
  void getChimeBuffer();
}

/**
 * 開始チャイムを鳴らす（クリップとは別に鳴らし、再生中のクリップは止めない）。鳴り終わりで解決する。
 */
export async function playChimeSound(): Promise<void> {
  const [context, buffer] = await Promise.all([ensureAudioRunning(), getChimeBuffer()]);
  if (!context || !buffer || context.state === 'closed') return;

  await new Promise<void>((resolve) => {
    // コンテキストが動いていないと onended が来ないため、長さ＋余裕で必ず解決する
    const safety = setTimeout(resolve, buffer.duration * 1000 + 300);
    try {
      const source = context.createBufferSource();
      const gainNode = context.createGain();
      // iOS の録音再生モード時の音量減衰をカバーするため増幅する
      gainNode.gain.value = 1.8;
      source.buffer = buffer;
      source.connect(gainNode);
      gainNode.connect(context.destination);
      source.onended = () => { clearTimeout(safety); resolve(); };
      source.start(0);
    } catch (e) {
      clientLogger.warn('audio:chime_play_failed', 'Chime playback failed', { err: e });
      clearTimeout(safety);
      resolve();
    }
  });
}
