import 'server-only';
import { serverEnv } from '@/lib/env';
import { DummyReceiptOcrService } from '@/lib/ocr/dummy';
import { GoogleCloudVisionReceiptOcrService } from '@/lib/ocr/vision';
import type { ReceiptOcrService } from '@/lib/ocr/types';

let instance: ReceiptOcrService | null = null;

/** OCR_DRIVER 環境変数で実装を切り替える */
export function getReceiptOcrService(): ReceiptOcrService {
  if (instance) return instance;
  instance =
    serverEnv.ocrDriver === 'vision'
      ? new GoogleCloudVisionReceiptOcrService()
      : new DummyReceiptOcrService();
  return instance;
}

export type { ReceiptOcrResult, ReceiptOcrService } from '@/lib/ocr/types';
