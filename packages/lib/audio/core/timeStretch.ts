/**
 * 音の高さを変えずに長さだけを変える（WSOLA）。React・ブラウザの API に依存しない。
 *
 * AudioBufferSourceNode の playbackRate はテープの早回しと同じで高さも変わる（速いと甲高く、遅いと籠る）ため、
 * 速度を変える音声は先にこの処理で伸び縮みさせ、等倍で再生する。
 * 入力から少しずつ重ねた枠を切り出して並べ直し、つなぎ目の波形が最もそろう位置を前後の範囲から探すことで、
 * 声の周期を崩さずに長さを変える。
 */

/** 枠の長さ（秒）。低い声の周期（〜12ms）が2つ以上入る長さにする */
const FRAME_SEC = 0.04;
/** つなぎ目を探す前後の範囲（秒）。100Hz の声の周期が入る幅にする */
const SEARCH_SEC = 0.01;
/** つなぎ目の比較で間引く目安の標本化周波数（全標本で比べると重いため） */
const COMPARE_RATE_HZ = 11025;

/**
 * 各チャンネルを rate 倍速に伸び縮みさせる（rate > 1 で短く、rate < 1 で長くなる）。
 * つなぎ目の位置は全チャンネルの平均で決め、チャンネル間のずれを出さない。
 * rate が 1 か、枠より短い音声は写しをそのまま返す。
 */
export function timeStretch(channels: Float32Array[], rate: number, sampleRate: number): Float32Array<ArrayBuffer>[] {
  if (!(rate > 0) || rate === 1 || channels.length === 0) return channels.map((c) => c.slice());

  const inLength = channels[0].length;
  const hop = Math.max(1, Math.round(sampleRate * (FRAME_SEC / 2)));
  const frameSize = hop * 2;
  if (inLength < frameSize) return channels.map((c) => c.slice());

  const tolerance = Math.round(sampleRate * SEARCH_SEC);
  const compareStep = Math.max(1, Math.round(sampleRate / COMPARE_RATE_HZ));
  const maxStart = inLength - frameSize;
  const outLength = Math.round(inLength / rate);
  const analysisHop = hop * rate;
  const guide = mixDown(channels);

  // 周期的なハン窓は半分ずつ重ねると和が 1 になる。端の重なりが足りない所は窓の和で割って音量をそろえる
  const window = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frameSize);

  const outputs = channels.map(() => new Float32Array(outLength));
  const windowSum = new Float32Array(outLength);

  let prevStart = 0;
  for (let outStart = 0, k = 0; outStart < outLength; outStart += hop, k++) {
    const start = k === 0 ? 0 : findBestStart(guide, Math.round(k * analysisHop), prevStart + hop);
    prevStart = start;

    const count = Math.min(frameSize, outLength - outStart);
    for (let c = 0; c < channels.length; c++) {
      const input = channels[c];
      const output = outputs[c];
      for (let i = 0; i < count; i++) output[outStart + i] += input[start + i] * window[i];
    }
    for (let i = 0; i < count; i++) windowSum[outStart + i] += window[i];
  }

  for (let i = 0; i < outLength; i++) {
    const sum = windowSum[i];
    if (sum <= 1e-6) continue;
    for (const output of outputs) output[i] /= sum;
  }
  return outputs;

  /** 予定の位置の前後から、前の枠の自然な続き（target）と波形が最もそろう開始位置を探す */
  function findBestStart(signal: Float32Array, nominal: number, target: number): number {
    const from = Math.max(0, nominal - tolerance);
    const to = Math.min(maxStart, nominal + tolerance);
    if (from > to) return Math.min(maxStart, Math.max(0, nominal));

    let best = from;
    let bestScore = -Infinity;
    for (let p = from; p <= to; p++) {
      let score = 0;
      for (let i = 0; i < hop; i += compareStep) {
        const t = target + i;
        if (t >= inLength) break;
        score += signal[p + i] * signal[t];
      }
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }
}

function mixDown(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const mixed = new Float32Array(channels[0].length);
  for (const channel of channels) {
    for (let i = 0; i < mixed.length; i++) mixed[i] += channel[i];
  }
  return mixed;
}
