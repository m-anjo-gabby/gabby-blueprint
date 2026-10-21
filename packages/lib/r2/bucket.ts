import { AwsClient } from 'aws4fetch';

/**
 * Cloudflare R2 のバケットへの接続（S3 互換の API を署名して呼ぶ）。
 * アプリ（packages/lib/video/storage.ts）のほか、取り込みのスクリプト・E2E の補助からも使うため、
 * Next.js・server-only に依らない処理だけを置く。秘密の鍵を持つため、ブラウザから読み込まない。
 */

export interface R2BucketConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** 署名付き URL の有効期間の上限（S3 の上限と同じ7日） */
const MAX_PRESIGN_TTL_SEC = 7 * 24 * 60 * 60;

/** 削除を同時に送る数（R2 の一括削除は Content-MD5 等の扱いが S3 と違うため、1件ずつ並べて送る） */
const DELETE_CONCURRENCY = 8;

/**
 * 環境変数から接続先を読む。bucketVar はバケット名の変数（用途ごとに分ける。例: R2_VIDEO_BUCKET）。
 * 足りない変数があれば、その名前を並べて例外にする（値は出さない）。
 */
export function readR2BucketConfig(
  bucketVar: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): R2BucketConfig {
  const names = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', bucketVar];
  const missing = names.filter((n) => !env[n]);
  if (missing.length > 0) throw new Error(`R2 の環境変数が未設定です: ${missing.join(', ')}`);
  return {
    accountId: env.R2_ACCOUNT_ID as string,
    accessKeyId: env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
    bucket: env[bucketVar] as string,
  };
}

export interface R2Bucket {
  /** 読み出し用の署名付き URL */
  presignGet(key: string, ttlSec: number): Promise<string>;
  /** ブラウザから PUT で置くための署名付き URL */
  presignPut(key: string, ttlSec: number): Promise<string>;
  /** 置いてあるファイルの大きさと種類（無ければ null） */
  head(key: string): Promise<{ size: number; contentType: string | null } | null>;
  /** サーバー・スクリプトから直接置く */
  put(key: string, body: Uint8Array<ArrayBuffer>, contentType: string): Promise<void>;
  /** 消す。無いキーも成功とみなす。消せなかったキーを返す */
  remove(keys: readonly string[]): Promise<{ failed: { key: string; error: unknown }[] }>;
}

export function createR2Bucket(config: R2BucketConfig): R2Bucket {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const base = `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}`;
  const objectUrl = (key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;

  async function presign(method: 'GET' | 'PUT', key: string, ttlSec: number): Promise<string> {
    const url = new URL(objectUrl(key));
    url.searchParams.set('X-Amz-Expires', String(Math.min(Math.max(1, Math.floor(ttlSec)), MAX_PRESIGN_TTL_SEC)));
    const signed = await client.sign(url.toString(), { method, aws: { signQuery: true } });
    return signed.url;
  }

  async function fail(res: Response, action: string, key: string): Promise<never> {
    const body = await res.text().catch(() => '');
    throw new Error(`R2 ${action} failed (${res.status}) ${key}: ${body.slice(0, 200)}`);
  }

  return {
    presignGet: (key, ttlSec) => presign('GET', key, ttlSec),
    presignPut: (key, ttlSec) => presign('PUT', key, ttlSec),

    async head(key) {
      const res = await client.fetch(objectUrl(key), { method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) return fail(res, 'HEAD', key);
      return {
        size: Number(res.headers.get('content-length') ?? 0),
        contentType: res.headers.get('content-type'),
      };
    },

    async put(key, body, contentType) {
      const res = await client.fetch(objectUrl(key), {
        method: 'PUT',
        body,
        headers: { 'content-type': contentType },
      });
      if (!res.ok) await fail(res, 'PUT', key);
    },

    async remove(keys) {
      const failed: { key: string; error: unknown }[] = [];
      const queue = [...new Set(keys)];
      const worker = async () => {
        for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
          try {
            const res = await client.fetch(objectUrl(key), { method: 'DELETE' });
            if (!res.ok && res.status !== 404) await fail(res, 'DELETE', key);
          } catch (error) {
            failed.push({ key, error });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(DELETE_CONCURRENCY, queue.length) }, worker));
      return { failed };
    },
  };
}
