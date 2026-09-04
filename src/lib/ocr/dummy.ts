import { logger } from '@/lib/logging/logger';
import { EMPTY_OCR_RESULT, type ReceiptOcrResult, type ReceiptOcrService } from '@/lib/ocr/types';

/**
 * 初期版の実装。何も解析せず「読み取れなかった」を返す。
 * UI 側は success=false のとき手入力のままにするだけなので、
 * これで機能としては成立する。
 */
export class DummyReceiptOcrService implements ReceiptOcrService {
  async analyzeReceipt(filePath: string): Promise<ReceiptOcrResult> {
    logger.debug('OCR はダミー実装のためスキップしました', {
      action: 'ocr.analyze',
      // パス自体はログに出さない (家族 ID とファイル ID が含まれるため)
      hasFile: Boolean(filePath),
    });
    return { ...EMPTY_OCR_RESULT, provider: 'dummy' };
  }
}
