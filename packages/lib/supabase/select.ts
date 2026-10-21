/** 列名の配列を、select に渡す「a, b, c」の形の文字列の型にする */
export type JoinColumns<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Rest extends readonly string[],
]
  ? Rest['length'] extends 0
    ? Head
    : `${Head}, ${JoinColumns<Rest>}`
  : string;

/**
 * 列名の配列（`as const`）を select に渡す文字列にする。`columns.join(', ')` のままだと型が string になり、
 * Supabase の型が選んだ列を読み取れない（結果の型がエラーの型になり、読み替えが必要になる）ため、連結した形を型でも持つ。
 */
export function joinColumns<const T extends readonly string[]>(columns: T): JoinColumns<T> {
  // 実行時の値は join の結果そのもので、型だけを連結した形にする
  return columns.join(', ') as JoinColumns<T>;
}
