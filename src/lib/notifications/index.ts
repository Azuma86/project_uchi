import 'server-only';
import { serverEnv } from '@/lib/env';
import { ConsoleNotificationService, NoopNotificationService } from '@/lib/notifications/console';
import { LineNotificationService } from '@/lib/notifications/line';
import type { NotificationInput, NotificationService } from '@/lib/notifications/types';
import { logger } from '@/lib/logging/logger';

let instance: NotificationService | null = null;

/**
 * NOTIFICATION_DRIVER 環境変数で実装を切り替える。
 * 呼び出し側はインターフェースにしか依存しない。
 */
export function getNotificationService(): NotificationService {
  if (instance) return instance;
  switch (serverEnv.notificationDriver) {
    case 'line':
      instance = new LineNotificationService();
      break;
    case 'noop':
      instance = new NoopNotificationService();
      break;
    default:
      instance = new ConsoleNotificationService();
  }
  return instance;
}

/**
 * 通知は「送れなくても本来の処理を失敗させない」。
 * 経費が承認できたのに通知エラーで画面がエラーになるのは避けたい。
 */
export async function notifySafely(input: NotificationInput): Promise<void> {
  try {
    await getNotificationService().send(input);
  } catch (error) {
    logger.error('通知の送信に失敗しました', error, {
      action: `notify.${input.type}`,
      familyId: input.familyId,
    });
  }
}

export type { NotificationInput, NotificationService };
