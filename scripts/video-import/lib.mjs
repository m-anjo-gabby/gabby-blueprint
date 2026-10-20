// scripts/video-import/lib.mjs
//
// 旧システムのビデオの取り込み（run.mjs）の、DB・ファイルに触れない処理（定義の検査・ffmpeg の引数・取り込みの計画）。

import { VIDEO_CATEGORY } from '../../packages/types/video.ts';

export const ENVS = ['dev', 'staging', 'prod'];

/**
 * 環境ごとに置く動画。容量の都合で実物は本番だけに置き、dev・staging は短い切り出しにする
 * （R2 の無料枠に3環境分の実物は入らないため。教材・セクション・並び順は全環境で同じにする）。
 */
export const FILE_MODE = { dev: 'clip', staging: 'clip', prod: 'full' };

/** 本番の実物を再エンコードする基準。これ以下の動画は画質を落とさないよう元のまま使う */
export const REENCODE_MAX_VIDEO_BPS = 900_000;
export const MAX_HEIGHT = 720;

/** 切り出しの長さと開始位置（冒頭は黒い画面・フェードインが多いため少し進めた所から切る） */
export const CLIP_SEC = 3;
const CLIP_OFFSET_SEC = 10;

/** 元の動画をそのまま本番に置けるか（ビットレートが高すぎる・720p を超える動画は再エンコードする） */
export function needsReencode({ videoBitRate, height }) {
  return !(videoBitRate > 0) || videoBitRate > REENCODE_MAX_VIDEO_BPS || height > MAX_HEIGHT;
}

/** 本番の実物の再エンコード（720p 以下・H.264・AAC。冒頭から再生できるよう faststart） */
export function fullEncodeArgs(src, out) {
  return [
    ...['-y', '-loglevel', 'error', '-i', src],
    ...['-vf', `scale=-2:'min(${MAX_HEIGHT},ih)'`],
    ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p'],
    ...['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out],
  ];
}

/** dev・staging 用の切り出し（360p・モノラル。1本 100KB 未満を目安にする） */
export function clipEncodeArgs(src, out, durationSec) {
  const start = durationSec >= CLIP_OFFSET_SEC + CLIP_SEC ? CLIP_OFFSET_SEC : 0;
  return [
    ...['-y', '-loglevel', 'error', '-ss', String(start), '-t', String(CLIP_SEC), '-i', src],
    ...['-vf', 'scale=-2:360'],
    ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '32', '-pix_fmt', 'yuv420p'],
    ...['-c:a', 'aac', '-ac', '1', '-b:a', '32k', '-movflags', '+faststart', out],
  ];
}

/** サムネイル（全環境で同じ。解像度は保ったまま WebP にし、幅は 1280px までにする） */
export function thumbnailArgs(src, out) {
  return [
    '-y',
    '-loglevel',
    'error',
    '-i',
    src,
    '-vf',
    "scale='min(1280,iw)':-2",
    '-c:v',
    'libwebp',
    '-quality',
    '80',
    out,
  ];
}

/** 定義（catalog.json）を並び順つきの一覧にする */
export function flattenCatalog(catalog) {
  return catalog.contents.flatMap((content, ci) =>
    content.sections.flatMap((section, si) =>
      section.videos.map((video, vi) => ({
        content,
        contentSeq: ci + 1,
        section,
        sectionSeq: si + 1,
        video,
        videoSeq: vi + 1,
      })),
    ),
  );
}

/** 定義の誤り（重複・空のセクション・種類の値）を返す。空なら正しい */
export function validateCatalog(catalog) {
  const errors = [];
  const categories = new Set(Object.values(VIDEO_CATEGORY));
  const labels = new Set();
  const codes = new Set();
  for (const content of catalog.contents) {
    if (labels.has(content.label)) errors.push(`教材のラベルが重複しています: ${content.label}`);
    labels.add(content.label);
    if (!categories.has(content.category))
      errors.push(`ビデオの種類の値が不正です: ${content.label} ${content.category}`);
    if (!content.name) errors.push(`教材名がありません: ${content.label}`);
    if (content.sections.length === 0) errors.push(`セクションがありません: ${content.label}`);
    const sectionNames = new Set();
    for (const section of content.sections) {
      if (sectionNames.has(section.name))
        errors.push(`セクションの見出しが重複しています: ${content.label} ${section.name}`);
      sectionNames.add(section.name);
      // 見出しの有無は和名で決めるため、英名だけのセクションは admin と同じく作らない
      if (!section.name && section.nameEn)
        errors.push(`英名だけのセクションがあります: ${content.label} ${section.nameEn}`);
      if (section.videos.length === 0)
        errors.push(`ビデオの無いセクションがあります: ${content.label} ${section.name}`);
      for (const video of section.videos) {
        if (codes.has(video.legacyCode)) errors.push(`旧ファイル名が重複しています: ${video.legacyCode}`);
        codes.add(video.legacyCode);
        if (!video.title) errors.push(`タイトルがありません: ${video.legacyCode}`);
      }
    }
  }
  return errors;
}

/** セクションの突き合わせのキー（見出しの無いセクションは content ごとに1つ） */
export function sectionKey(contentId, sectionName) {
  return `${contentId}\u0000${sectionName ?? ''}`;
}

/**
 * 既に取り込んだ分を除いた計画を作る。突き合わせは、教材 = ラベル、セクション = 教材と見出し、ビデオ = 旧ファイル名。
 * 既にある行は書き換えない（運営が admin で直した名前・並び順を戻さないため）。
 */
export function planImport(catalog, existing) {
  const plan = { contents: [], newVideos: 0, existingVideos: 0 };
  for (const [ci, content] of catalog.contents.entries()) {
    const contentId = existing.contentIdByLabel.get(content.label) ?? null;
    const sections = content.sections.map((section, si) => {
      const sectionId = contentId ? (existing.sectionIdByKey.get(sectionKey(contentId, section.name)) ?? null) : null;
      const videos = section.videos.map((video, vi) => ({
        video,
        seq: vi + 1,
        exists: existing.legacyCodes.has(video.legacyCode),
      }));
      for (const v of videos) {
        if (v.exists) plan.existingVideos += 1;
        else plan.newVideos += 1;
      }
      return { section, seq: si + 1, sectionId, videos };
    });
    plan.contents.push({ content, seq: ci + 1, contentId, sections });
  }
  return plan;
}
