import 'server-only';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logging/logger';

/**
 * Secret Manager から秘密情報を取得する。
 *
 * 取得の優先順位:
 *   1. 環境変数 (Cloud Run の「シークレットを環境変数として公開」機能で注入される)
 *   2. Secret Manager API を直接呼ぶ (ローテーションを即時反映したい場合)
 *
 * Cloud Run では 1 が基本。理由:
 *   - コールドスタート時に API 呼び出しが増えない (起動が速い = 課金時間が短い)
 *   - アプリのコードが Secret Manager に依存しない
 *   - リビジョンごとにバージョンを固定できる (`:latest` ではなく番号指定が安全)
 *
 * 必要な IAM:
 *   Cloud Run のサービスアカウントに roles/secretmanager.secretAccessor を
 *   「そのシークレットに対してのみ」付与する (プロジェクト全体には付けない)。
 *
 * 秘密でないもの (Firebase の apiKey など) はここに入れないこと。
 * Secret Manager はアクセスのたびに課金対象の操作が発生する。
 */

const cache = new Map<string, { value: string; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

let client: SecretManagerServiceClient | null = null;

function getClient(): SecretManagerServiceClient {
  if (!client) client = new SecretManagerServiceClient();
  return client;
}

export type SecretName =
  | 'LINE_CHANNEL_SECRET'
  | 'LINE_CHANNEL_ACCESS_TOKEN'
  | 'VISION_API_KEY';

/**
 * @param name シークレット名 (Secret Manager 上の ID と環境変数名を一致させる)
 * @returns 見つからなければ null (機能を無効化して動き続けるため例外にしない)
 */
export async function getSecret(name: SecretName | string): Promise<string | null> {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;

  const cached = cache.get(name);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.value;

  const projectId = serverEnv.gcpProjectId;
  if (!projectId) return null;

  try {
    const [version] = await getClient().accessSecretVersion({
      name: `projects/${projectId}/secrets/${name}/versions/latest`,
    });
    const value = version.payload?.data?.toString();
    if (!value) return null;
    cache.set(name, { value, fetchedAt: Date.now() });
    return value;
  } catch (error) {
    // シークレット未作成 / 権限不足でもアプリ全体は落とさない
    logger.warn('Secret Manager からの取得に失敗しました', {
      secret: name,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}
