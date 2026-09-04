/**
 * 領収書 OCR の抽象化。
 *
 * 初期版では OCR を行わない (DummyReceiptOcrService)。
 * 将来 Cloud Vision API に差し替えるとき、経費フォーム側のコードを
 * 変更しなくて済むようにインターフェースだけ先に決めておく。
 */

export type ReceiptOcrResult = {
  /** 解析に成功したか (信頼できる値が取れたか) */
  success: boolean;
  /** 購入日 (JST の日付キー "2026-09-04")。読み取れなければ null。 */
  purchaseDate: string | null;
  /** 合計金額 (円)。読み取れなければ null。 */
  amount: number | null;
  /** 店舗名。読み取れなければ null。 */
  merchant: string | null;
  /** 0.0 - 1.0。UI で「自動入力しますか?」を出すかの判断に使う。 */
  confidence: number;
  /** 実装名 (ログ・デバッグ用) */
  provider: string;
};

export interface ReceiptOcrService {
  /**
   * @param filePath Cloud Storage 上のオブジェクトパス
   *                 (families/{familyId}/receipts/{uuid}.webp)
   */
  analyzeReceipt(filePath: string): Promise<ReceiptOcrResult>;
}

export const EMPTY_OCR_RESULT: ReceiptOcrResult = {
  success: false,
  purchaseDate: null,
  amount: null,
  merchant: null,
  confidence: 0,
  provider: 'none',
};
