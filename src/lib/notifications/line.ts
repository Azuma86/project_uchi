import 'server-only';
import { getSecret } from '@/lib/secrets';
import { logger } from '@/lib/logging/logger';
import type { NotificationInput, NotificationService } from '@/lib/notifications/types';
import { serverEnv } from '@/lib/env';

/**
 * LINE Messaging API 実装 (将来有効化する枠)。
 *
 * 有効化の手順:
 *   1. LINE Developers で Messaging API チャネルを作成
 *   2. Secret Manager に LINE_CHANNEL_ACCESS_TOKEN を登録
 *   3. Cloud Run のサービスアカウントへ、そのシークレットの
 *      roles/secretmanager.secretAccessor を付与
 *   4. NOTIFICATION_DRIVER=line をセット
 *   5. users/{uid}.lineUserId を LINE ログイン or 友だち追加 Webhook で保存
 *
 * 現状は lineUserId が無いためログを出して終了する。
 * (課金ポイント: LINE 公式アカウントは無料メッセージ数を超えると有料)
 */
export class LineNotificationService implements NotificationService {
  async send(input: NotificationInput): Promise<void> {
    const token = await getSecret('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token) {
      logger.warn('LINE_CHANNEL_ACCESS_TOKEN が未設定のため通知をスキップしました', {
        action: `notify.${input.type}`,
        familyId: input.familyId,
      });
      return;
    }

    const targets = input.recipients.filter((r) => r.lineUserId);
    if (targets.length === 0) {
      logger.info('LINE ユーザー ID が未連携のため通知をスキップしました', {
        action: `notify.${input.type}`,
        familyId: input.familyId,
      });
      return;
    }

    const url = input.path ? `${serverEnv.appUrl}${input.path}` : serverEnv.appUrl;
    const text = `${input.title}\n${input.body}\n${url}`;

    await Promise.all(
      targets.map(async (target) => {
        try {
          const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ to: target.lineUserId, messages: [{ type: 'text', text }] }),
          });
          if (!response.ok) {
            logger.warn('LINE 通知の送信に失敗しました', {
              action: `notify.${input.type}`,
              familyId: input.familyId,
              status: response.status,
            });
          }
        } catch (error) {
          logger.error('LINE 通知でエラーが発生しました', error, {
            action: `notify.${input.type}`,
            familyId: input.familyId,
          });
        }
      }),
    );
  }
}
