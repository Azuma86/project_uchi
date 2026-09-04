import 'server-only';
import { logger } from '@/lib/logging/logger';
import { EMPTY_OCR_RESULT, type ReceiptOcrResult, type ReceiptOcrService } from '@/lib/ocr/types';

/**
 * Cloud Vision API 実装の枠 (将来有効化する)。
 *
 * 有効化の手順:
 *   1. `gcloud services enable vision.googleapis.com`
 *   2. Cloud Run のサービスアカウントへ、Vision API を呼ぶ権限を付与
 *      (Vision は API キー不要。ADC + roles/serviceusage.serviceUsageConsumer
 *       相当があれば呼べる。通常は追加ロール不要)
 *   3. `npm i @google-cloud/vision`
 *   4. OCR_DRIVER=vision をセット
 *
 * 実装方針 (メモ):
 *   - client.textDetection({ image: { source: { imageUri: `gs://bucket/path` } } })
 *     で GCS 上の画像を直接読める (ダウンロード不要 = Cloud Run の負荷が減る)
 *   - Vision のサービスアカウントに roles/storage.objectViewer が必要
 *   - 金額は「合計 / 小計 / ¥ 表記の最大値」から推定
 *   - 日付は YYYY/MM/DD, YY年M月D日 などの正規表現で抽出
 *
 * 課金ポイント: Vision API は月 1,000 ユニットまで無料、その先は従量課金。
 * 家族で月数十枚なら無料枠に収まる想定。
 */
export class GoogleCloudVisionReceiptOcrService implements ReceiptOcrService {
  async analyzeReceipt(filePath: string): Promise<ReceiptOcrResult> {
    logger.warn('Vision OCR は未実装です。OCR_DRIVER=dummy を使用してください。', {
      action: 'ocr.analyze',
      hasFile: Boolean(filePath),
    });
    return { ...EMPTY_OCR_RESULT, provider: 'vision-not-implemented' };
  }
}
