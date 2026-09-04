/**
 * 通知の抽象化。
 *
 * 初期版では実際には送信しない (ConsoleNotificationService)。
 * 将来 LINE Messaging API / Web Push を足すときに、
 * 呼び出し側 (Server Action) を一切変更しなくて済むようにインターフェースを切る。
 */

export type NotificationType =
  | 'expense.submitted' // 申請された -> admin へ
  | 'expense.approved' // 承認された -> 申請者へ
  | 'expense.rejected' // 却下された -> 申請者へ
  | 'calendar.tomorrow' // 明日の予定 -> 家族全員へ
  | 'family.member_joined';

export type NotificationRecipient = {
  userId: string;
  /** 将来 LINE 連携したときに使う (users/{uid}.lineUserId) */
  lineUserId?: string | null;
};

export type NotificationInput = {
  type: NotificationType;
  familyId: string;
  recipients: NotificationRecipient[];
  title: string;
  body: string;
  /** アプリ内の該当画面への相対パス */
  path?: string;
};

export interface NotificationService {
  send(input: NotificationInput): Promise<void>;
}
