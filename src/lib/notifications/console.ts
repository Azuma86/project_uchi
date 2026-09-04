import { logger } from '@/lib/logging/logger';
import type { NotificationInput, NotificationService } from '@/lib/notifications/types';

/** 開発用: Cloud Logging に「送ったつもり」のログだけ残す */
export class ConsoleNotificationService implements NotificationService {
  async send(input: NotificationInput): Promise<void> {
    logger.info('通知 (未送信 / コンソール出力のみ)', {
      action: `notify.${input.type}`,
      familyId: input.familyId,
      recipientCount: input.recipients.length,
      // 本文には金額や店舗名が入りうるのでログには出さない
      title: input.title,
    });
  }
}

/** 通知を完全に無効化したい環境 (テストなど) 用 */
export class NoopNotificationService implements NotificationService {
  async send(): Promise<void> {
    // 何もしない
  }
}
