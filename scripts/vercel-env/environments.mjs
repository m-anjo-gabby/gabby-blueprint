// scripts/vercel-env/environments.mjs
//
// 環境ごとの接続先（Vercel のプロジェクト・反映先の Environment、各アプリの URL、Supabase）。
// 秘密の値は含めない（値は values/.env.<env>、定義は manifest.mjs）。

/** Vercel のチーム（gabbys-projects。apps/admin/.vercel/project.json の orgId は別の古いチームのため使わない） */
export const VERCEL_TEAM_ID = 'team_GoIL7IhwYdKe0XLs4UVEZ4rh';

export const APPS = /** @type {const} */ (['admin', 'student', 'coach']);

/**
 * @typedef {{ project: string, projectId: string, targets: string[] }} VercelTarget
 *   projectId は .github/workflows/deploy.yml の「Resolve project」と同じ値にする（lib.test.mjs で突き合わせる）
 * @typedef {{
 *   label: string,
 *   supabaseRef: string,
 *   urls: Record<'admin' | 'student' | 'coach', string>,
 *   localUrls?: Record<'admin' | 'student' | 'coach', string>,
 *   vercel?: Record<'admin' | 'student' | 'coach', VercelTarget>,
 *   confirmWord?: string,
 * }} EnvironmentConfig
 */

/** @type {Record<'dev' | 'staging' | 'prod', EnvironmentConfig>} */
export const ENVIRONMENTS = {
  // dev は手元の起動（apps/*/.env.local。--check で確認）と、Vercel の dev プロジェクト（Git 連携なし。
  // .github/workflows/deploy.yml で必要な時だけデプロイ）が同じ Supabase の dev を使う。
  dev: {
    label: 'dev',
    supabaseRef: 'vihincuxiizavuxoctul',
    urls: {
      admin: 'https://blueprint-admin-dev.vercel.app',
      student: 'https://blueprint-student-dev.vercel.app',
      coach: 'https://blueprint-coach-dev.vercel.app',
    },
    // 手元の起動の URL（--check で apps/*/.env.local と照合する）
    localUrls: {
      admin: 'https://localhost:3001',
      student: 'https://localhost:3000',
      coach: 'https://localhost:3002',
    },
    vercel: {
      admin: { project: 'blueprint-admin-dev', projectId: 'prj_QsIkByBrgufMfDPpTc5XyPdGSPUV', targets: ['production'] },
      student: { project: 'blueprint-student-dev', projectId: 'prj_JaDvlbZFH1k4YVg1EWC5ReB0Tcma', targets: ['production'] },
      coach: { project: 'blueprint-coach-dev', projectId: 'prj_lYTSawX7FjeOvDD1oplbQE0TW3zJ', targets: ['production'] },
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
      admin: { project: 'blueprint-admin-stg', projectId: 'prj_DECTrxS8NBmwOVhmTMp1SjqV1bZ2', targets: ['production'] },
      student: { project: 'blueprint-student-stg', projectId: 'prj_FoNKKVtXqEnzwVM0wVVqpNIOTFcI', targets: ['production'] },
      coach: { project: 'blueprint-coach-stg', projectId: 'prj_rsJqGyVtvZuF2hvsqEt7EWpNTrow', targets: ['production'] },
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
      admin: { project: 'blueprint-admin-prod', projectId: 'prj_cA9h7wnBqummrIhpuScSVzd8a4Ty', targets: ['production'] },
      student: { project: 'blueprint-student-prod', projectId: 'prj_nF8Hn9zjtxV0bhq8nWNqbptMhWeL', targets: ['production'] },
      coach: { project: 'blueprint-coach-prod', projectId: 'prj_uZ0lZfkJCMNCX7GJdzlEJ767o0aa', targets: ['production'] },
    },
    // 反映前にこの文字列の手入力を求める（取り違え防止）
    confirmWord: 'prod',
  },
};
