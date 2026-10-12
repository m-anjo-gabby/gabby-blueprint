// scripts/vercel-env/environments.mjs
//
// 環境ごとの接続先（Vercel のプロジェクト・反映先の Environment、各アプリの URL、Supabase）。
// 秘密の値は含めない（値は values/.env.<env>、定義は manifest.mjs）。

/** Vercel のチーム（gabbys-projects。apps/admin/.vercel/project.json の orgId は別の古いチームのため使わない） */
export const VERCEL_TEAM_ID = 'team_GoIL7IhwYdKe0XLs4UVEZ4rh';

export const APPS = /** @type {const} */ (['admin', 'student', 'coach']);

/**
 * @typedef {{ project: string, targets: string[] }} VercelTarget
 * @typedef {{
 *   label: string,
 *   supabaseRef: string,
 *   urls: Record<'admin' | 'student' | 'coach', string>,
 *   vercel?: Record<'admin' | 'student' | 'coach', VercelTarget>,
 *   confirmWord?: string,
 * }} EnvironmentConfig
 */

/** @type {Record<'dev' | 'staging' | 'prod', EnvironmentConfig>} */
export const ENVIRONMENTS = {
  // dev は Vercel に反映しない（apps/*/.env.local の確認だけ。--check）
  dev: {
    label: 'dev（ローカル）',
    supabaseRef: 'vihincuxiizavuxoctul',
    urls: {
      admin: 'https://localhost:3001',
      student: 'https://localhost:3000',
      coach: 'https://localhost:3002',
    },
  },
  staging: {
    label: 'staging',
    supabaseRef: 'vodmgorcugymrpdmdqkg',
    urls: {
      admin: 'https://blueprint-admin-stg.vercel.app',
      student: 'https://blueprint-student-stg.vercel.app',
      coach: 'https://blueprint-coach-stg.vercel.app',
    },
    vercel: {
      admin: { project: 'blueprint-admin-stg', targets: ['production'] },
      student: { project: 'blueprint-student-stg', targets: ['production'] },
      coach: { project: 'blueprint-coach-stg', targets: ['production'] },
    },
  },
  prod: {
    label: '本番',
    supabaseRef: 'xzoefwwzminkqqzbhtwq',
    urls: {
      admin: 'https://blueprint-admin.gabbyacademy.com',
      student: 'https://blueprint.gabbyacademy.com',
      coach: 'https://blueprint-coach.gabbyacademy.com',
    },
    vercel: {
      admin: { project: 'blueprint-admin-prod', targets: ['production'] },
      student: { project: 'blueprint-student-prod', targets: ['production'] },
      coach: { project: 'blueprint-coach-prod', targets: ['production'] },
    },
    // 反映前にこの文字列の手入力を求める（取り違え防止）
    confirmWord: 'prod',
  },
};
