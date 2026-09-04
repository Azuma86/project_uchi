/**
 * Server Action とフォーム (Client Component) の間でやり取りする状態。
 *
 * このファイルは「クライアントからも import される」ため、
 * server-only な処理を書いてはいけない (サーバー専用の処理は lib/actions.ts)。
 */
export type FormState = {
  error?: string | null;
  success?: string | null;
  /** 作成した対象の ID など、画面遷移や表示に使う値 */
  data?: Record<string, string> | null;
};

export const emptyFormState: FormState = {};

export function formError(message: string): FormState {
  return { error: message };
}
