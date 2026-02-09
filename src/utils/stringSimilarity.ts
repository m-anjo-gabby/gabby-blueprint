/**
 * 2つの文字列の類似度を 0.0 〜 1.0 で返します
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();
  const s2 = str2.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0;

  // レーベンシュタイン距離の計算
  const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }

  const distance = track[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return (maxLength - distance) / maxLength;
}