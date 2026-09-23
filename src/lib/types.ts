/**
 * アプリ全体で共有するドメイン型。
 *
 * 重要: ここで定義する型は「Server Component から Client Component へ渡せる」
 * ことを前提にしている。Firestore の Timestamp 型はそのままクライアントへ
 * 渡せないため、境界を越える型では日時を ISO 8601 文字列 (UTC) で表現する。
 * Firestore ↔ ISO 文字列の変換は src/lib/data/ の各リポジトリが担当する。
 */

/** 家族内の権限。admin は member の権限をすべて含む。 */
export type Role = 'admin' | 'member';

export const ROLES: Role[] = ['admin', 'member'];

export const ROLE_LABEL: Record<Role, string> = {
  admin: '管理者',
  member: 'メンバー',
};

/** users/{userId} — 家族をまたぐユーザー本人の情報 */
export type UserProfile = {
  id: string;
  displayName: string;
  email: string | null;
  photoUrl: string | null;
  /** 所属している家族 ID の一覧 (ログイン直後の家族解決を 1 read で済ませるため) */
  familyIds: string[];
  /** 最後に開いていた家族。複数所属時の初期選択に使う。 */
  lastActiveFamilyId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** families/{familyId} */
export type Family = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** families/{familyId}/members/{userId} — ドキュメント ID は Firebase UID */
export type FamilyMember = {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  role: Role;
  joinedAt: string;
};

/** families/{familyId}/events/{eventId} */
export type CalendarEvent = {
  id: string;
  familyId: string;
  title: string;
  description: string | null;
  /** UTC ISO 8601 */
  startAt: string;
  /** UTC ISO 8601 */
  endAt: string;
  allDay: boolean;
  location: string | null;
  /** 誰の予定か (未割り当ては null = 家族全体の予定) */
  assignedUserId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** families/{familyId}/albums/{albumId} */
export type Album = {
  id: string;
  familyId: string;
  name: string;
  description: string | null;
  /** 一覧のサムネイルに使う写真 (非正規化。写真追加時に更新) */
  coverPhotoId: string | null;
  photoCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** families/{familyId}/photos/{photoId} */
export type Photo = {
  id: string;
  familyId: string;
  albumId: string | null;
  /** Cloud Storage 上のパス。families/{familyId}/photos/... に固定される。 */
  storagePath: string;
  /** グリッド表示用の縮小版 (通信量と署名回数を減らすため別ファイルで保存) */
  thumbnailStoragePath: string | null;
  caption: string | null;
  /** 撮影日時 (EXIF が無ければアップロード日時) */
  takenAt: string;
  width: number | null;
  height: number | null;
  byteSize: number;
  contentType: string;
  uploadedBy: string;
  createdAt: string;
};

export const EXPENSE_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: '下書き',
  pending: '承認待ち',
  approved: '承認済み',
  rejected: '却下',
};

/**
 * 経費のカテゴリ。
 * 一覧から外したカテゴリ (旧 'entertainment' など) が保存済みデータに
 * 残っていても、読み込み時に 'other' へ丸められる (src/lib/data/expenses.ts)。
 */
export const EXPENSE_CATEGORIES = [
  'food',
  'daily',
  'clothing',
  'education',
  'medical',
  'transport',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: '食費',
  daily: '日用品',
  clothing: '洋服',
  education: '教育',
  medical: '医療',
  transport: '交通',
  other: 'その他',
};

export const EXPENSE_CATEGORY_EMOJI: Record<ExpenseCategory, string> = {
  food: '🍚',
  daily: '🧺',
  clothing: '👕',
  education: '📚',
  medical: '💊',
  transport: '🚃',
  other: '📦',
};

/** families/{familyId}/expenses/{expenseId} */
export type Expense = {
  id: string;
  familyId: string;
  applicantUserId: string;
  /** 購入日 (日単位。UTC ISO 8601 で、JST のその日の 00:00 を指す) */
  purchaseDate: string;
  merchant: string;
  /** 日本円。小数を持たないので整数で保存する。 */
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  receiptStoragePath: string | null;
  status: ExpenseStatus;
  adminComment: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** 集計クエリ用の年月キー ("2026-09")。複合インデックスを減らすための非正規化。 */
  yearMonth: string;
  createdAt: string;
  updatedAt: string;
};

/** ログイン中ユーザーと「今見ている家族」をまとめたもの */
export type SessionContext = {
  userId: string;
  displayName: string;
  email: string | null;
  photoUrl: string | null;
  familyId: string;
  familyName: string;
  role: Role;
  /** 複数家族に所属している場合の切り替え用 */
  families: { id: string; name: string; role: Role }[];
};
