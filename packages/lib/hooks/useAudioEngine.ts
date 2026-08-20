'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { createBrowserClient } from '../supabase/client';
import { setAudioSessionPlayback, createChimeAudioBuffer, playChimeBuffer, audioBufferCache } from '../sprint/utils';

/**
 * `useSprintAudio` / `usePlayAudioSpeech` の共通AudioContext基盤。
 *
 * 両フックはiOS WebKit対応のために微妙に異なる挙動（再生開始ディレイ、
 * unmount時のAudioContext破棄有無、suspended状態からの復旧方法、
 * decodeAudioDataのタイムアウト有無、チャイム再生前の既存トラック停止有無、
 * URL解決方法）を持っており、本フックはそれらを暗黙的に統一せず、
 * すべてオプションとして明示的に受け取ることで両フックの挙動を1:1で再現する。
 */
export interface AudioEngineOptions {
  /** マウント/アンマウント時に連動して停止させる音声認識の停止関数（useSprintAudio用途） */
  stopListening?: () => void;
  /** 再生開始までのディレイ（ms）。iOSのマイク停止音フェードアウト待ち等に使用 */
  startDelayMs?: number;
  /** unmount時にAudioContextをcloseするか。false の場合はネイティブGCに委ねる */
  closeOnUnmount?: boolean;
  /** suspended状態からの復旧に、タイムアウト付き強制再生成リカバリを使うか */
  useSuspendedRecovery?: boolean;
  /** decodeAudioDataにタイムアウトを設けるか（ms）。未指定はタイムアウトなし */
  decodeTimeoutMs?: number;
  /** チャイム再生前に、再生中のトラックを停止するか */
  stopBeforeChime?: boolean;
  /** 再生URLの解決方法。'concat' = 環境変数から手動組み立て / 'sdk' = supabase.storage.getPublicUrl */
  urlResolution: 'concat' | 'sdk';
}

export interface AudioEnginePlayOptions {
  /** 再生アイテムの識別子。指定した場合のみ isPlaying 追跡・同一id再タップでのトグル停止が有効になる */
  id?: string;
  playbackRate?: number;
  /** 同一idを再タップした際、トグル停止ではなく最初から再生し直す */
  restart?: boolean;
  /** trueの場合、一切再生せず即座に解決する（終了処理中の再生防止用） */
  skip?: boolean;
  bucketName?: string;
}

/**
 * 'ok': 通常状態。
 * 'needsResume': バックグラウンド放置によりAudioContextがsuspendedのまま復帰したことを検知した状態。
 *   「タップして音声を再開」のような軽い導線を表示する。
 * 'failed': 明示的な再開操作（unlock経由）を試みても running まで回復できなかった状態。
 *   iOS側でページのJavaScript実行状態ごと破棄されている可能性が高く、
 *   このアプリ内では復旧できないため、リロードを促す明確な案内を表示する。
 */
export type AudioResumeStatus = 'ok' | 'needsResume' | 'failed';

export interface UseAudioEngineReturn {
  audioCtxRef: React.RefObject<AudioContext | null>;
  chimeBufferRef: React.RefObject<AudioBuffer | null>;
  play: (path: string | null, opts?: AudioEnginePlayOptions) => Promise<void>;
  playChime: () => Promise<void>;
  stop: () => void;
  unlock: () => Promise<void>;
  preload: (path: string, opts?: { bucketName?: string }) => Promise<void>;
  /** 再生中に再生速度をライブ変更する（現在再生中のソースがあれば即時反映） */
  setLiveRate: (rate: number) => void;
  isPlaying: string | null;
  /** 音声再開の状態。呼び出し側はこの値に応じて通知UIを出し分ける */
  resumeStatus: AudioResumeStatus;
}

export function useAudioEngine(opts: AudioEngineOptions): UseAudioEngineReturn {
  const {
    stopListening,
    startDelayMs = 0,
    closeOnUnmount = false,
    useSuspendedRecovery = false,
    decodeTimeoutMs,
    stopBeforeChime = false,
    urlResolution,
  } = opts;

  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [resumeStatus, setResumeStatus] = useState<AudioResumeStatus>('ok');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const chimeBufferRef = useRef<AudioBuffer | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentPlayingIdRef = useRef<string | null>(null);
  const supabaseRef = useRef(urlResolution === 'sdk' ? createBrowserClient() : null);
  // 🚀 iOS対策: バックグラウンド復帰時にsuspendedを検知したら true。
  // 次のユーザー操作（同期コールスタック内）で、resumeを試す前に問答無用でAudioContextを
  // 作り直す。iOSはユーザー操作の同期コールスタックの外で作られた/resumeされたAudioContextを
  // 確実にはアンロックしないため、「resumeしてダメなら作り直す」という非同期待ち構造では
  // 長時間放置後の復旧に失敗することがある。
  const needsHardResetRef = useRef(false);

  /**
   * AudioContextを取得・初期化する。needsHardResetRef が立っている場合は、
   * resumeを試す前にユーザー操作の同期コールスタック内で即座にインスタンスを作り直す。
   * それでもなお suspended な場合は、useSuspendedRecovery の設定に応じたフォールバックへ進む
   * （true: タイムアウト付き再生成リトライ / false: 単純な resume() のみ）。
   *
   * @param explicitUserResume 「タップして音声を再開」導線など、ユーザーが明示的に再開を
   *   意図した操作からの呼び出しかどうか。true の場合に限り、復旧に失敗したら 'failed'
   *   （リロード誘導）まで状態をエスカレーションする。
   */
  const ensureContextReady = useCallback(async (explicitUserResume = false): Promise<AudioContext | null> => {
    if (typeof window === 'undefined') return null;

    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (audioCtxRef.current && audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = null;
    }

    // このensureContextReady呼び出しが、バックグラウンド復帰後の復旧試行に該当するかを記録しておく。
    // 通常時（初回ロード直後で未操作のため単に'suspended'なだけ等）は needsResumeNotice に一切触れない。
    const isRecoveryAttempt = needsHardResetRef.current;

    if (isRecoveryAttempt && audioCtxRef.current) {
      try { audioCtxRef.current.close().catch(() => {}); } catch (_) { /* no-op */ }
      audioCtxRef.current = null;
    }
    needsHardResetRef.current = false;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextClass();
    }

    let ctx = audioCtxRef.current;

    if (ctx.state === 'suspended') {
      if (useSuspendedRecovery) {
        try {
          const resumeWithTimeout = Promise.race([
            ctx.resume(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('AudioContext resume timeout')), 500)),
          ]);
          await resumeWithTimeout;

          if (ctx.state === 'suspended') {
            console.warn('AudioContext locked. Re-creating instance...');
            ctx.close().catch(() => {});
            audioCtxRef.current = new AudioContextClass();
            ctx = audioCtxRef.current;
            await ctx.resume();
          }
        } catch (e) {
          console.warn('Failed or timed out resuming AudioContext. Force recreating...', e);
          try { ctx.close().catch(() => {}); } catch (_) { /* no-op */ }
          audioCtxRef.current = new AudioContextClass();
          ctx = audioCtxRef.current;
          try { await ctx.resume(); } catch (_) { /* no-op */ }
        }
      } else {
        try {
          await ctx.resume();
        } catch (e) {
          console.warn('Failed to resume AudioContext:', e);
        }
      }
    }

    if (isRecoveryAttempt) {
      const recovered = audioCtxRef.current?.state === 'running';
      if (recovered) {
        setResumeStatus('ok');
      } else if (explicitUserResume) {
        // 「タップして音声を再開」導線からの明示的な再開操作でも回復しなかった場合、
        // ページのJavaScript実行状態ごとiOSに破棄されている可能性が高く、
        // このセッション内での復旧は見込めないためリロードを促す
        setResumeStatus('failed');
      } else {
        // ユーザー操作の同期コールスタック外（自動再生フロー等）からの呼び出しで
        // 回復しなかった場合は、まだ「タップして再開」導線での再試行に望みがあるため維持する
        setResumeStatus('needsResume');
      }
    }

    return audioCtxRef.current;
  }, [useSuspendedRecovery]);

  // ─── マウント時の初期化 / アンマウント時のクリーンアップ ────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setAudioSessionPlayback();
    stopListening?.();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    ensureContextReady().then((ctx) => {
      if (!ctx) return;
      createChimeAudioBuffer(ctx)
        .then((buffer) => { chimeBufferRef.current = buffer; })
        .catch((e: unknown) => console.warn('Chime pre-render failed:', e));
    });

    return () => {
      setAudioSessionPlayback();
      stopListening?.();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch (_) { /* no-op */ }
        currentSourceRef.current = null;
      }

      if (closeOnUnmount && audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => { /* no-op */ });
        audioCtxRef.current = null;
      }
      currentPlayingIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🚀 iOS対策: バックグラウンドから復帰した瞬間にAudioContextがsuspendedのままなら、
  // 「次のユーザー操作で問答無用に作り直す」フラグを立てる。visibilitychange自体は
  // ユーザー操作ではないため、ここではAudioContextへは一切触れず、フラグを立てるのみに留める。
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && audioCtxRef.current?.state === 'suspended') {
        needsHardResetRef.current = true;
        setResumeStatus('needsResume');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const stop = useCallback(() => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch (_) { /* no-op */ }
      currentSourceRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(null);
    currentPlayingIdRef.current = null;
  }, []);

  const unlock = useCallback(async () => {
    const ctx = await ensureContextReady(true);
    if (ctx && ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (e) { console.warn('Failed to resume AudioContext from interaction:', e); }
    }
  }, [ensureContextReady]);

  const resolveUrl = useCallback((path: string, bucketName?: string): string => {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (urlResolution === 'sdk' && supabaseRef.current) {
      const { data } = supabaseRef.current.storage.from(bucketName || 'audio').getPublicUrl(path);
      return data.publicUrl;
    }
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucketName || 'audio'}/${path}`;
  }, [urlResolution]);

  const play = useCallback((path: string | null, playOpts: AudioEnginePlayOptions = {}): Promise<void> => {
    const { id, playbackRate = 1.0, restart, skip, bucketName } = playOpts;

    if (skip) return Promise.resolve();

    // 同一idの再タップ（restart指定なし）はトグル停止扱い。idが未指定の呼び出し（useSprintAudio経由）は
    // このトグル判定自体を行わず、常に新規再生として扱う。
    if (id !== undefined && currentPlayingIdRef.current === id && !restart) {
      stop();
      return Promise.resolve();
    }

    return ensureContextReady().then((ctx) => {
      if (!ctx) return;

      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch (_) { /* no-op */ }
        currentSourceRef.current = null;
      }

      if (!path) {
        currentPlayingIdRef.current = null;
        setIsPlaying(null);
        return;
      }

      const bucketUrl = resolveUrl(path, bucketName);

      return new Promise<void>((resolve) => {
        const startPlayback = (buffer: AudioBuffer) => {
          const run = () => {
            if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
              resolve();
              return;
            }

            const source = audioCtxRef.current.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = playbackRate;

            const gainNode = audioCtxRef.current.createGain();
            gainNode.gain.value = 1.0;

            source.connect(gainNode);
            gainNode.connect(audioCtxRef.current.destination);

            currentSourceRef.current = source;
            currentPlayingIdRef.current = id ?? null;
            if (id !== undefined) setIsPlaying(id);

            const clearState = () => {
              if (currentPlayingIdRef.current === (id ?? null)) {
                currentPlayingIdRef.current = null;
                if (id !== undefined) setIsPlaying(null);
              }
              if (currentSourceRef.current === source) {
                currentSourceRef.current = null;
              }
              resolve();
            };

            source.onended = clearState;

            try {
              const delaySeconds = startDelayMs / 1000;
              if (delaySeconds > 0) {
                source.start(audioCtxRef.current.currentTime + delaySeconds);
              } else {
                source.start(0);
              }
            } catch (err) {
              console.error('AudioSource start error:', err);
              clearState();
            }
          };

          if (ctx.state === 'suspended') {
            ctx.resume().then(run).catch(() => {
              setIsPlaying(null);
              currentPlayingIdRef.current = null;
              resolve();
            });
          } else {
            run();
          }
        };

        const cached = audioBufferCache.get(bucketUrl);
        if (cached) {
          startPlayback(cached);
          return;
        }

        fetch(bucketUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
            return res.arrayBuffer();
          })
          .then((arrayBuffer) => {
            if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
              throw new Error('AudioContext was closed during fetch');
            }
            const decode = audioCtxRef.current.decodeAudioData(arrayBuffer);
            if (decodeTimeoutMs) {
              return Promise.race([
                decode,
                new Promise<AudioBuffer>((_, reject) => setTimeout(() => reject(new Error('decodeAudioData timeout')), decodeTimeoutMs)),
              ]);
            }
            return decode;
          })
          .then((decodedBuffer) => {
            audioBufferCache.set(bucketUrl, decodedBuffer);
            startPlayback(decodedBuffer);
          })
          .catch((err) => {
            console.warn('Audio Context decode error, fallback resolve:', err);
            setIsPlaying(null);
            currentPlayingIdRef.current = null;
            resolve();
          });
      });
    });
  }, [ensureContextReady, resolveUrl, stop, startDelayMs, decodeTimeoutMs]);

  const playChime = useCallback(async (): Promise<void> => {
    const ctx = await ensureContextReady();
    const buffer = chimeBufferRef.current;
    if (!ctx || !buffer) return;

    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (stopBeforeChime) {
        stop();
      }
      await playChimeBuffer(ctx, buffer);
    } catch (e) {
      console.warn('AudioContext chime playback failed or interrupted:', e);
    }
  }, [ensureContextReady, stopBeforeChime, stop]);

  const preload = useCallback(async (path: string, preloadOpts?: { bucketName?: string }) => {
    if (!path) return;
    const ctx = await ensureContextReady();
    if (!ctx) return;

    const bucketUrl = resolveUrl(path, preloadOpts?.bucketName);
    if (!audioBufferCache.has(bucketUrl)) {
      try {
        const res = await fetch(bucketUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          audioBufferCache.set(bucketUrl, decoded);
        }
      } catch (_) { /* no-op */ }
    }
  }, [ensureContextReady, resolveUrl]);

  const setLiveRate = useCallback((rate: number) => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.playbackRate.value = rate; } catch (_) { /* no-op */ }
    }
  }, []);

  return { audioCtxRef, chimeBufferRef, play, playChime, stop, unlock, preload, setLiveRate, isPlaying, resumeStatus };
}
