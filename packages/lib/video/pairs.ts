/**
 * ビデオのペア（com_m_video.pair_with_next）。印の付いたビデオは、教材の中の並び順で次のビデオと組になり、
 * 今日のメニューでは2本を同じ日に割り当てる。並び順で決めるため、admin の表示とメニューで同じ組み方を使う。
 */

export interface PairableVideo {
  pair_with_next: boolean;
}

/**
 * 教材の中の並び順のビデオを、メニューで1回分として割り当てる組（1本か2本）に分ける。
 * 前から順に、印のあるビデオを次の1本と組にする。組の2本目の印・教材の最後のビデオの印は使わない
 * （並べ替えで印が続いても、1本が2つの組に入らないようにするため）。
 */
export function groupVideoPairs<T extends PairableVideo>(videos: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < videos.length; i += 1) {
    const video = videos[i];
    const next = videos[i + 1];
    if (video.pair_with_next && next) {
      groups.push([video, next]);
      i += 1;
    } else {
      groups.push([video]);
    }
  }
  return groups;
}

/** ペアの中の位置（1本目・2本目。シングルは null） */
export type VideoPairPosition = 1 | 2 | null;

/** 並び順のビデオごとの、ペアの中の位置（admin の一覧で組を見せるため） */
export function videoPairPositions<T extends PairableVideo & { video_id: string }>(
  videos: readonly T[],
): Map<string, VideoPairPosition> {
  const positions = new Map<string, VideoPairPosition>();
  for (const group of groupVideoPairs(videos)) {
    group.forEach((video, index) => {
      positions.set(video.video_id, group.length === 2 ? ((index + 1) as 1 | 2) : null);
    });
  }
  return positions;
}
