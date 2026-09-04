import 'server-only';
import { getDb } from '@/lib/firebase/admin';

/**
 * Firestore のコレクション参照を 1 箇所にまとめる。
 * パスを文字列で散らかさないことで、家族スコープの付け忘れを防ぐ。
 *
 * データモデル (詳細な設計理由は README「Firestore データモデル」を参照):
 *
 *   users/{userId}                              ... 家族をまたぐユーザー情報
 *   inviteCodes/{code}                          ... 招待コード -> familyId の逆引き
 *   families/{familyId}
 *   families/{familyId}/members/{userId}        ... doc ID = Firebase UID
 *   families/{familyId}/events/{eventId}
 *   families/{familyId}/albums/{albumId}
 *   families/{familyId}/photos/{photoId}        ... アルバムのサブではなく家族直下
 *   families/{familyId}/expenses/{expenseId}
 *
 * 家族データをすべて families/{familyId} のサブコレクションに置くのが要点。
 * こうすると Security Rules で
 *   match /families/{familyId}/{document=**}
 * のように「家族単位」でまとめて守れる。
 */

export const db = () => getDb();

export const usersCol = () => getDb().collection('users');
export const userDoc = (userId: string) => usersCol().doc(userId);

export const inviteCodesCol = () => getDb().collection('inviteCodes');
export const inviteCodeDoc = (code: string) => inviteCodesCol().doc(code);

export const familiesCol = () => getDb().collection('families');
export const familyDoc = (familyId: string) => familiesCol().doc(familyId);

export const membersCol = (familyId: string) => familyDoc(familyId).collection('members');
export const memberDoc = (familyId: string, userId: string) => membersCol(familyId).doc(userId);

export const eventsCol = (familyId: string) => familyDoc(familyId).collection('events');
export const eventDoc = (familyId: string, eventId: string) => eventsCol(familyId).doc(eventId);

export const albumsCol = (familyId: string) => familyDoc(familyId).collection('albums');
export const albumDoc = (familyId: string, albumId: string) => albumsCol(familyId).doc(albumId);

export const photosCol = (familyId: string) => familyDoc(familyId).collection('photos');
export const photoDoc = (familyId: string, photoId: string) => photosCol(familyId).doc(photoId);

export const expensesCol = (familyId: string) => familyDoc(familyId).collection('expenses');
export const expenseDoc = (familyId: string, expenseId: string) =>
  expensesCol(familyId).doc(expenseId);
