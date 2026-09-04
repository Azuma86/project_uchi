import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '@/lib/firebase/admin';
import {
  familyDoc,
  inviteCodeDoc,
  memberDoc,
  membersCol,
  userDoc,
} from '@/lib/data/paths';
import { conflict, forbidden, invalidInput, notFound } from '@/lib/errors';
import { str, strOrNull, tsToIso } from '@/lib/firebase/converters';
import type { Family, FamilyMember, Role, UserProfile } from '@/lib/types';
import { INVITE_CODE_TTL_MS, generateInviteCode } from '@/lib/data/invite-code';
import { canChangeRole, canRemoveMember } from '@/lib/permissions';
import { logger } from '@/lib/logging/logger';

/**
 * 家族 (Family) とメンバー管理。
 *
 * 「1 ユーザーが複数の家族に所属できる」ことを前提にしている
 * (実家と自分の家庭、など)。users/{uid}.familyIds に所属先を持たせて
 * ログイン時の解決を 1 read で済ませている。
 */

export type InviteCodeInfo = {
  code: string;
  familyId: string;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
};

/** ログイン直後に users/{uid} が無ければ作る */
export async function ensureUserProfile(params: {
  userId: string;
  displayName: string;
  email: string | null;
  photoUrl: string | null;
}): Promise<UserProfile> {
  const ref = userDoc(params.userId);
  const snap = await ref.get();

  if (!snap.exists) {
    const now = FieldValue.serverTimestamp();
    await ref.set({
      displayName: params.displayName,
      email: params.email,
      photoUrl: params.photoUrl,
      familyIds: [],
      lastActiveFamilyId: null,
      createdAt: now,
      updatedAt: now,
    });
    logger.info('ユーザープロフィールを作成しました', {
      userId: params.userId,
      action: 'user.create',
    });
    return {
      id: params.userId,
      displayName: params.displayName,
      email: params.email,
      photoUrl: params.photoUrl,
      familyIds: [],
      lastActiveFamilyId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const data = snap.data() ?? {};
  // Google ログインで写真や名前が更新された場合だけ書き込む (無駄な write を避ける)
  const patch: Record<string, unknown> = {};
  if (params.email && data.email !== params.email) patch.email = params.email;
  if (params.photoUrl && data.photoUrl !== params.photoUrl) patch.photoUrl = params.photoUrl;
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = FieldValue.serverTimestamp();
    await ref.update(patch);
  }

  return {
    id: snap.id,
    displayName: str(data.displayName, params.displayName),
    email: strOrNull(patch.email ?? data.email),
    photoUrl: strOrNull(patch.photoUrl ?? data.photoUrl),
    familyIds: Array.isArray(data.familyIds) ? (data.familyIds as string[]) : [],
    lastActiveFamilyId: strOrNull(data.lastActiveFamilyId),
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

/**
 * 家族を作成する。作成者は自動的に admin になる。
 *
 * batch で 4 つの書き込みを 1 回のアトミック操作にまとめている。
 * 途中で失敗して「家族はあるがメンバーがいない」状態になるのを防ぐため。
 */
export async function createFamily(params: {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  name: string;
}): Promise<{ familyId: string; inviteCode: string }> {
  const db = getDb();
  const familyRef = familyDoc(db.collection('families').doc().id);
  const code = generateInviteCode();
  const now = FieldValue.serverTimestamp();
  const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_CODE_TTL_MS);

  const batch = db.batch();

  batch.set(familyRef, {
    name: params.name,
    createdBy: params.userId,
    inviteCode: code,
    inviteCodeExpiresAt: expiresAt,
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(memberDoc(familyRef.id, params.userId), {
    userId: params.userId,
    displayName: params.displayName,
    photoUrl: params.photoUrl,
    role: 'admin' satisfies Role,
    joinedAt: now,
  });

  batch.set(inviteCodeDoc(code), {
    familyId: familyRef.id,
    createdBy: params.userId,
    createdAt: now,
    expiresAt,
  });

  batch.set(
    userDoc(params.userId),
    {
      familyIds: FieldValue.arrayUnion(familyRef.id),
      lastActiveFamilyId: familyRef.id,
      updatedAt: now,
    },
    { merge: true },
  );

  await batch.commit();

  logger.info('家族を作成しました', {
    userId: params.userId,
    familyId: familyRef.id,
    action: 'family.create',
  });

  return { familyId: familyRef.id, inviteCode: code };
}

/**
 * 招待コードで家族に参加する。
 *
 * transaction を使う理由: 「コードの有効性確認」と「メンバー追加」の間に
 * コードが無効化されるかもしれないため。
 */
export async function joinFamilyByInviteCode(params: {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  code: string;
}): Promise<{ familyId: string; familyName: string }> {
  const db = getDb();

  return db.runTransaction(async (tx) => {
    const codeSnap = await tx.get(inviteCodeDoc(params.code));
    if (!codeSnap.exists) {
      throw invalidInput('招待コードが見つかりません。コードを確認してください。');
    }
    const codeData = codeSnap.data() ?? {};
    const expiresAt = codeData.expiresAt as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      throw invalidInput('この招待コードは有効期限が切れています。管理者に再発行を依頼してください。');
    }

    const familyId = str(codeData.familyId);
    if (!familyId) throw invalidInput('招待コードが正しくありません。');

    const familyRef = familyDoc(familyId);
    const familySnap = await tx.get(familyRef);
    if (!familySnap.exists) throw notFound('招待先の家族が見つかりません。');

    const memberRef = memberDoc(familyId, params.userId);
    const memberSnap = await tx.get(memberRef);
    if (memberSnap.exists) {
      throw conflict('すでにこの家族に参加しています。');
    }

    const now = FieldValue.serverTimestamp();
    tx.set(memberRef, {
      userId: params.userId,
      displayName: params.displayName,
      photoUrl: params.photoUrl,
      role: 'member' satisfies Role,
      joinedAt: now,
    });
    tx.update(familyRef, {
      memberCount: FieldValue.increment(1),
      updatedAt: now,
    });
    tx.set(
      userDoc(params.userId),
      {
        familyIds: FieldValue.arrayUnion(familyId),
        lastActiveFamilyId: familyId,
        updatedAt: now,
      },
      { merge: true },
    );

    return { familyId, familyName: str(familySnap.data()?.name, '家族') };
  });
}

export async function getFamily(familyId: string): Promise<Family | null> {
  const snap = await familyDoc(familyId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    name: str(data.name, '家族'),
    createdBy: str(data.createdBy),
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

export async function listMembers(familyId: string): Promise<FamilyMember[]> {
  const snap = await membersCol(familyId).orderBy('joinedAt', 'asc').get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      userId: doc.id,
      displayName: str(data.displayName, 'メンバー'),
      photoUrl: strOrNull(data.photoUrl),
      role: (data.role === 'admin' ? 'admin' : 'member') as Role,
      joinedAt: tsToIso(data.joinedAt),
    };
  });
}

/** 現在有効な招待コード。期限切れなら null。 */
export async function getActiveInviteCode(familyId: string): Promise<InviteCodeInfo | null> {
  const snap = await familyDoc(familyId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const code = strOrNull(data.inviteCode);
  const expiresAt = data.inviteCodeExpiresAt as Timestamp | undefined;
  if (!code || !expiresAt || expiresAt.toMillis() < Date.now()) return null;
  return {
    code,
    familyId,
    expiresAt: expiresAt.toDate().toISOString(),
    createdBy: str(data.createdBy),
    createdAt: tsToIso(data.createdAt),
  };
}

/** 招待コードを再発行する (古いコードは削除して使えなくする) */
export async function regenerateInviteCode(params: {
  familyId: string;
  userId: string;
}): Promise<InviteCodeInfo> {
  const db = getDb();
  const code = generateInviteCode();
  const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_CODE_TTL_MS);
  const familyRef = familyDoc(params.familyId);

  const snap = await familyRef.get();
  const previousCode = strOrNull(snap.data()?.inviteCode);

  const batch = db.batch();
  if (previousCode) batch.delete(inviteCodeDoc(previousCode));
  batch.set(inviteCodeDoc(code), {
    familyId: params.familyId,
    createdBy: params.userId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });
  batch.update(familyRef, {
    inviteCode: code,
    inviteCodeExpiresAt: expiresAt,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  logger.info('招待コードを再発行しました', {
    userId: params.userId,
    familyId: params.familyId,
    action: 'family.invite_code.regenerate',
  });

  return {
    code,
    familyId: params.familyId,
    expiresAt: expiresAt.toDate().toISOString(),
    createdBy: params.userId,
    createdAt: new Date().toISOString(),
  };
}

export async function updateFamilyName(params: {
  familyId: string;
  name: string;
}): Promise<void> {
  await familyDoc(params.familyId).update({
    name: params.name,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function countAdmins(familyId: string): Promise<number> {
  // aggregate query (count) はドキュメントを読まずに件数だけ取得できるので
  // 通常の読み取りより大幅に安い。
  const snapshot = await membersCol(familyId).where('role', '==', 'admin').count().get();
  return snapshot.data().count;
}

export async function changeMemberRole(params: {
  familyId: string;
  actorUserId: string;
  actorRole: Role;
  targetUserId: string;
  nextRole: Role;
}): Promise<void> {
  const memberRef = memberDoc(params.familyId, params.targetUserId);
  const snap = await memberRef.get();
  if (!snap.exists) throw notFound('対象のメンバーが見つかりません。');
  const targetRole = (snap.data()?.role === 'admin' ? 'admin' : 'member') as Role;

  const adminCount = await countAdmins(params.familyId);
  if (
    !canChangeRole({
      actorRole: params.actorRole,
      actorUserId: params.actorUserId,
      targetUserId: params.targetUserId,
      targetRole,
      nextRole: params.nextRole,
      adminCount,
    })
  ) {
    throw forbidden('この権限変更はできません (管理者が0人になる変更は許可されません)。');
  }

  await memberRef.update({ role: params.nextRole });
  logger.info('メンバーの権限を変更しました', {
    userId: params.actorUserId,
    familyId: params.familyId,
    action: 'family.member.change_role',
    targetUserId: params.targetUserId,
    nextRole: params.nextRole,
  });
}

export async function removeMember(params: {
  familyId: string;
  actorUserId: string;
  actorRole: Role;
  targetUserId: string;
}): Promise<void> {
  const db = getDb();
  const memberRef = memberDoc(params.familyId, params.targetUserId);
  const snap = await memberRef.get();
  if (!snap.exists) throw notFound('対象のメンバーが見つかりません。');
  const targetRole = (snap.data()?.role === 'admin' ? 'admin' : 'member') as Role;

  const adminCount = await countAdmins(params.familyId);
  if (
    !canRemoveMember({
      actorRole: params.actorRole,
      actorUserId: params.actorUserId,
      targetUserId: params.targetUserId,
      targetRole,
      adminCount,
    })
  ) {
    throw forbidden('このメンバーは削除できません。');
  }

  const batch = db.batch();
  batch.delete(memberRef);
  batch.update(familyDoc(params.familyId), {
    memberCount: FieldValue.increment(-1),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(
    userDoc(params.targetUserId),
    {
      familyIds: FieldValue.arrayRemove(params.familyId),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();

  logger.info('メンバーを削除しました', {
    userId: params.actorUserId,
    familyId: params.familyId,
    action: 'family.member.remove',
    targetUserId: params.targetUserId,
  });
}

/** 家族の切り替え (複数所属時) */
export async function setActiveFamily(params: {
  userId: string;
  familyId: string;
}): Promise<void> {
  await userDoc(params.userId).set(
    {
      lastActiveFamilyId: params.familyId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** 表示名の変更 (users とすべての members ドキュメントを揃える) */
export async function updateDisplayName(params: {
  userId: string;
  familyIds: string[];
  displayName: string;
}): Promise<void> {
  const db = getDb();
  const batch = db.batch();
  batch.set(
    userDoc(params.userId),
    { displayName: params.displayName, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  for (const familyId of params.familyIds) {
    batch.update(memberDoc(familyId, params.userId), { displayName: params.displayName });
  }
  await batch.commit();
}

/**
 * 自分自身が家族から抜ける。
 * 管理者が 1 人しかいない場合は、誰も管理できなくなるので抜けられない。
 */
export async function leaveFamily(params: {
  familyId: string;
  userId: string;
  role: Role;
}): Promise<void> {
  if (params.role === 'admin') {
    const adminCount = await countAdmins(params.familyId);
    if (adminCount <= 1) {
      throw conflict(
        '管理者が1人のため家族から抜けられません。他のメンバーを管理者にしてからお試しください。',
      );
    }
  }

  const db = getDb();
  const batch = db.batch();
  batch.delete(memberDoc(params.familyId, params.userId));
  batch.update(familyDoc(params.familyId), {
    memberCount: FieldValue.increment(-1),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(
    userDoc(params.userId),
    {
      familyIds: FieldValue.arrayRemove(params.familyId),
      lastActiveFamilyId: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();

  logger.info('家族から脱退しました', {
    userId: params.userId,
    familyId: params.familyId,
    action: 'family.leave',
  });
}
