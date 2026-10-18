import type { ImgHTMLAttributes } from 'react';

interface ExternalImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  alt: string;
}

/**
 * 大きさを CSS で決める画像（Storage にある利用者の画像・選択中のファイルのプレビュー等）を出す。
 * next/image は width・height か fill の指定が要るため、これらは <img> で出し、その出し口をここに集める。
 * アプリの中に置く固定の画像（ロゴ等）は next/image を使う（ESLint の @next/next/no-img-element は有効のまま）。
 */
export function ExternalImage({ alt, ...props }: ExternalImageProps) {
  // eslint-disable-next-line @next/next/no-img-element -- 上のとおり、next/image を使わない画像の出し口をここに集める
  return <img alt={alt} {...props} />;
}
