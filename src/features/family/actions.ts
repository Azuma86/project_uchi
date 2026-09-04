'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser, requireAdminAccess, requireFamilyAccess } from '@/lib/auth/session';
import {
  changeMemberRole,
  createFamily,
  ensureUserProfile,
  joinFamilyByInviteCode,
  leaveFamily,
  regenerateInviteCode,
  removeMember,
  setActiveFamily,
  updateDisplayName,
  updateFamilyName,
} from '@/lib/data/families';
import { getUserProfile } from '@/lib/auth/session';
import {
  changeRoleSchema,
  createFamilySchema,
  joinFamilySchema,
  memberActionSchema,
  updateFamilySchema,
  updateProfileSchema,
} from '@/lib/validation/schemas';
import { normalizeInviteCode } from '@/lib/data/invite-code';
import { field, toFormState, type FormState } from '@/lib/actions';
import { unauthenticated } from '@/lib/errors';
import { notifySafely } from '@/lib/notifications';
import { logger } from '@/lib/logging/logger';
import type { Role } from '@/lib/types';

/**
 * 家族まわりの Server Action。
 *
 * すべての操作で必ず
 *   1. ログイン確認 (getCurrentUser / requireFamilyAccess)
 *   2. familyId が本人の所属家族かの確認
 *   3. role の確認 (admin 限定操作)
 *   4. 入力バリデーション (Zod)
 * を行う。クライアントの UI 状態は一切信用しない。
 */

async function currentUserOrThrow() {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

export async function createFamilyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const user = await currentUserOrThrow();
    const parsed = createFamilySchema.safeParse({ name: field(formData, 'name') });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    const profile = await ensureUserProfile({
      userId: user.uid,
      displayName:
        (typeof user.name === 'string' && user.name) || user.email?.split('@')[0] || 'メンバー',
      email: user.email ?? null,
      photoUrl: typeof user.picture === 'string' ? user.picture : null,
    });

    await createFamily({
      userId: user.uid,
      displayName: profile.displayName,
      photoUrl: profile.photoUrl,
      name: parsed.data.name,
    });
  } catch (error) {
    return toFormState(error, { action: 'family.create' });
  }

  revalidatePath('/', 'layout');
  redirect('/home');
}

export async function joinFamilyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await currentUserOrThrow();
    const parsed = joinFamilySchema.safeParse({
      inviteCode: normalizeInviteCode(field(formData, 'inviteCode')),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '招待コードを確認してください。' };
    }

    const profile = await ensureUserProfile({
      userId: user.uid,
      displayName:
        (typeof user.name === 'string' && user.name) || user.email?.split('@')[0] || 'メンバー',
      email: user.email ?? null,
      photoUrl: typeof user.picture === 'string' ? user.picture : null,
    });

    const { familyId } = await joinFamilyByInviteCode({
      userId: user.uid,
      displayName: profile.displayName,
      photoUrl: profile.photoUrl,
      code: parsed.data.inviteCode,
    });

    logger.info('家族に参加しました', {
      userId: user.uid,
      familyId,
      action: 'family.join',
    });

    await notifySafely({
      type: 'family.member_joined',
      familyId,
      recipients: [],
      title: '新しい家族メンバーが参加しました',
      body: `${profile.displayName} さんが参加しました。`,
      path: '/settings',
    });
  } catch (error) {
    return toFormState(error, { action: 'family.join' });
  }

  revalidatePath('/', 'layout');
  redirect('/home');
}

export async function regenerateInviteCodeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const familyId = field(formData, 'familyId');
    const session = await requireAdminAccess(familyId);
    const info = await regenerateInviteCode({ familyId, userId: session.userId });
    revalidatePath('/settings');
    return { success: '招待コードを再発行しました。', data: { code: info.code } };
  } catch (error) {
    return toFormState(error, { action: 'family.invite_code.regenerate' });
  }
}

export async function updateFamilyNameAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const parsed = updateFamilySchema.safeParse({
      familyId: field(formData, 'familyId'),
      name: field(formData, 'name'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }
    await requireAdminAccess(parsed.data.familyId);
    await updateFamilyName(parsed.data);
    revalidatePath('/', 'layout');
    return { success: '家族の名前を変更しました。' };
  } catch (error) {
    return toFormState(error, { action: 'family.update_name' });
  }
}

export async function changeMemberRoleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const parsed = changeRoleSchema.safeParse({
      familyId: field(formData, 'familyId'),
      targetUserId: field(formData, 'targetUserId'),
      role: field(formData, 'role'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    const session = await requireAdminAccess(parsed.data.familyId);
    await changeMemberRole({
      familyId: parsed.data.familyId,
      actorUserId: session.userId,
      actorRole: session.role,
      targetUserId: parsed.data.targetUserId,
      nextRole: parsed.data.role as Role,
    });
    revalidatePath('/settings');
    return { success: '権限を変更しました。' };
  } catch (error) {
    return toFormState(error, { action: 'family.member.change_role' });
  }
}

export async function removeMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const parsed = memberActionSchema.safeParse({
      familyId: field(formData, 'familyId'),
      targetUserId: field(formData, 'targetUserId'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    const session = await requireAdminAccess(parsed.data.familyId);
    await removeMember({
      familyId: parsed.data.familyId,
      actorUserId: session.userId,
      actorRole: session.role,
      targetUserId: parsed.data.targetUserId,
    });
    revalidatePath('/settings');
    return { success: 'メンバーを削除しました。' };
  } catch (error) {
    return toFormState(error, { action: 'family.member.remove' });
  }
}

export async function switchFamilyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const familyId = field(formData, 'familyId');
    const session = await requireFamilyAccess(familyId);
    await setActiveFamily({ userId: session.userId, familyId });
  } catch (error) {
    return toFormState(error, { action: 'family.switch' });
  }
  revalidatePath('/', 'layout');
  redirect('/home');
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await currentUserOrThrow();
    const parsed = updateProfileSchema.safeParse({ displayName: field(formData, 'displayName') });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }
    const profile = await getUserProfile(user.uid);
    await updateDisplayName({
      userId: user.uid,
      familyIds: profile?.familyIds ?? [],
      displayName: parsed.data.displayName,
    });
    revalidatePath('/', 'layout');
    return { success: '表示名を変更しました。' };
  } catch (error) {
    return toFormState(error, { action: 'user.update_profile' });
  }
}

/** 家族から自分自身が抜ける (admin が 1 人のときは不可) */
export async function leaveFamilyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const familyId = field(formData, 'familyId');
    const session = await requireFamilyAccess(familyId);
    await leaveFamily({ familyId, userId: session.userId, role: session.role });
  } catch (error) {
    return toFormState(error, { action: 'family.leave' });
  }
  revalidatePath('/', 'layout');
  redirect('/onboarding');
}
