'use server';

import { requireFamilyAccess } from '@/lib/auth/session';
import { createUploadTarget } from '@/lib/storage/gcs';
import { uploadTargetSchema } from '@/lib/validation/schemas';
import { invalidInput, actionError, actionOk, type ActionResult } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

/**
 * 署名付きアップロード URL の発行 (写真・領収書で共通)。
 *
 * ポイント:
 *   - 保存先パスはサーバーが生成する (クライアントは指定できない)
 *   - familyId は「本人が所属している家族か」をサーバーで検証する
 *   - サイズ・Content-Type をここで 1 回、アップロード後にもう 1 回検証する
 */
export type UploadTargetResult = {
  uploadUrl: string;
  storagePath: string;
  headers: Record<string, string>;
};

export async function requestUploadTargetAction(input: {
  familyId: string;
  kind: 'photo' | 'thumbnail' | 'receipt';
  contentType: string;
  byteSize: number;
}): Promise<ActionResult<UploadTargetResult>> {
  try {
    const parsed = uploadTargetSchema.safeParse(input);
    if (!parsed.success) {
      throw invalidInput(parsed.error.issues[0]?.message ?? 'アップロードできない形式です。');
    }

    const session = await requireFamilyAccess(parsed.data.familyId);

    const target = await createUploadTarget({
      familyId: session.familyId,
      kind: parsed.data.kind,
      contentType: parsed.data.contentType,
      byteSize: parsed.data.byteSize,
    });

    return actionOk({
      uploadUrl: target.uploadUrl,
      storagePath: target.storagePath,
      headers: target.headers,
    });
  } catch (error) {
    logger.warn('アップロード URL の発行に失敗しました', {
      action: 'upload.request_target',
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return actionError(error);
  }
}
