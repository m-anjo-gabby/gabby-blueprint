/**
 * アプリ全体で1つだけ持つ音声再生の基盤（React に依存しない）。
 *
 * - AudioContext はアプリ全体で1つ。画面を離れても閉じず、自動では作り直さない。
 *   以前はフック・画面ごとに AudioContext を作り、閉じないものもあったため、
 *   「スプリント→結果→リトライ」等の繰り返しで iOS の同時保持数の上限に達し、再生できなくなることがあった。
 * - 作り直すのは、利用者のタップ（unlockAudio）の時点で一度動いていたコンテキストが running に戻らない場合だけ
 *   （iOS はタップの同期コールスタック内で作ったコンテキストしか確実にアンロックしないため、作り直しはその場で行う）。
 * - 再生中の音声（クリップ）は常に1つ。新しいクリップを再生すると前のクリップは止まる。
 * - 音声再開の状態（resumeStatus）もここで一元管理し、各画面は subscribe で購読する。
 */

/**
 * 'ok': 通常状態。
 * 'needsResume': 一度動いていた AudioContext が running に戻らない（バックグラウンド復帰等）。「タップして音声を再開」を出す。
 * 'failed': タップでの再開でも running に戻らなかった。iOS 側でページの実行状態ごと破棄されている可能性が高く、リロードを促す。
 */
export type AudioResumeStatus = 'ok' | 'needsResume' | 'failed';

const RESUME_TIMEOUT_MS = 500;

let ctx: AudioContext | null = null;
/** 一度でも running になったか（初回のタップ前の suspended は「要復旧」ではないため区別する） */
let hasEverRun = false;
let resumeStatus: AudioResumeStatus = 'ok';
const statusListeners = new Set<() => void>();

/** デコード済み音声のキャッシュ（AudioBuffer はコンテキストを作り直しても使い回せる）。キー: 公開URL */
const bufferCache = new Map<string, AudioBuffer>();
const inflightLoads = new Map<string, Promise<AudioBuffer>>();

let chimeBuffer: AudioBuffer | null = null;
let chimePromise: Promise<AudioBuffer | null> | null = null;

interface ActiveClip {
  source: AudioBufferSourceNode;
  ownerId: number;
  /** 再生を終えた扱いにして待っている Promise を解決する（停止・終了・コンテキスト作り直しのいずれでも1回だけ） */
  finish: () => void;
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

function markRunningIfSo(context: AudioContext) {
  if (isRunning(context.state)) {
    hasEverRun = true;
    setResumeStatus('ok');
  }
}

function createContext(): AudioContext | null {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return null;
  const created = new AudioContextClass();
  created.onstatechange = () => markRunningIfSo(created);
  ctx = created;
  return created;
}

/** 共有の AudioContext を返す（無ければ作る）。状態は変えない */
export function getAudioContext(): AudioContext | null {
  if (ctx && ctx.state !== 'closed') return ctx;
  return createContext();
}

function resumeWithTimeout(context: AudioContext): Promise<void> {
  return Promise.race([
    context.resume(),
    new Promise<void>((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS)),
  ]).catch(() => { /* no-op */ });
}

/**
 * 再生・プリロード等、タップ起点とは限らない処理から呼ぶ。resume を試すだけで作り直さない。
 * 一度動いていたのに running に戻らなければ 'needsResume'（タップして再開）にする。
 */
export async function ensureAudioRunning(): Promise<AudioContext | null> {
  const context = getAudioContext();
  if (!context) return null;
  if (isRunning(context.state)) {
    markRunningIfSo(context);
    return context;
  }
  await resumeWithTimeout(context);
  if (isRunning(context.state)) {
    markRunningIfSo(context);
  } else if (hasEverRun) {
    setResumeStatus('needsResume');
  }
  return context;
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
 * 利用者のタップから呼ぶ。await より前の同期区間で、必要ならその場で AudioContext を作り直す。
 * それでも running にならなければ 'failed'（リロード誘導）にする。
 */
export async function unlockAudio(): Promise<void> {
  let context = getAudioContext();
  if (!context) return;
  if (isRunning(context.state)) {
    markRunningIfSo(context);
    return;
  }

  const isRecovery = hasEverRun;
  if (isRecovery) {
    // 一度動いていたコンテキストが止まっている（バックグラウンド復帰・通話等による中断）。
    // iOS では resume が効かないことが多いため、タップの同期区間で作り直す（古いものは必ず閉じ、数を増やさない）。
    stopActiveClip();
    const old = context;
    context = createContext();
    old.close().catch(() => { /* no-op */ });
    if (!context) return;
  }

  playSilentTick(context);
  await resumeWithTimeout(context);

  if (isRunning(context.state)) {
    markRunningIfSo(context);
  } else if (isRecovery) {
    setResumeStatus('failed');
  }
}

function stopActiveClip() {
  const clip = activeClip;
  if (!clip) return;
  activeClip = null;
  try { clip.source.stop(); } catch { /* no-op */ }
  clip.finish();
}

/**
 * 再生中のクリップを止める。ownerId を渡した場合は、その持ち主のクリップのときだけ止める。
 */
export function stopAudioClip(ownerId?: number) {
  if (!activeClip) return;
  if (ownerId !== undefined && activeClip.ownerId !== ownerId) return;
  stopActiveClip();
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
 * 再生終了・停止・コンテキストの作り直しのいずれでも解決する。
 */
export async function playAudioClip(
  buffer: AudioBuffer,
  opts: { ownerId: number; playbackRate?: number; onStart?: () => void },
): Promise<void> {
  const context = await ensureAudioRunning();
  if (!context || context.state === 'closed') return;

  stopActiveClip();

  return new Promise<void>((resolve) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = opts.playbackRate ?? 1.0;
    source.connect(context.destination);

    let finished = false;
    const clip: ActiveClip = {
      source,
      ownerId: opts.ownerId,
      finish: () => {
        if (finished) return;
        finished = true;
        resolve();
      },
    };
    source.onended = () => {
      if (activeClip === clip) activeClip = null;
      clip.finish();
    };
    activeClip = clip;
    opts.onStart?.();

    try {
      source.start(0);
    } catch (err) {
      console.error('AudioSource start error:', err);
      if (activeClip === clip) activeClip = null;
      clip.finish();
    }
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
      console.warn('Chime pre-render failed:', e);
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
      console.warn('Chime playback failed:', e);
      clearTimeout(safety);
      resolve();
    }
  });
}
