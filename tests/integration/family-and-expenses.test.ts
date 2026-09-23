import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/firebase/admin';
import {
  changeMemberRole,
  createFamily,
  ensureUserProfile,
  getActiveInviteCode,
  joinFamilyByInviteCode,
  leaveFamily,
  listMembers,
  regenerateInviteCode,
  removeMember,
} from '@/lib/data/families';
import {
  countPendingExpenses,
  createExpense,
  deleteExpense,
  getExpense,
  getMonthlySummary,
  listExpenses,
  reviewExpense,
  submitExpense,
  updateExpense,
  visibleExpenses,
  withdrawExpense,
} from '@/lib/data/expenses';
import { createEvent, deleteEvent, listEventsForMonth, listTodayEvents } from '@/lib/data/events';
import { createAlbum, deleteAlbum, listAlbums } from '@/lib/data/albums';
import { AppError } from '@/lib/errors';
import { currentJstMonthKey, toDateInputValue } from '@/lib/datetime';

/**
 * データ層の統合テスト (Firestore エミュレータに実際に読み書きする)。
 *
 *   npm run test:integration
 *
 * ここで確認したいのは、Security Rules では表現できない部分:
 *   - トランザクションによる競合の防止 (二重承認など)
 *   - 非正規化フィールド (memberCount, photoCount, yearMonth) の整合性
 *   - 集計結果が正しいか
 */

const DAD = 'itest-dad';
const MOM = 'itest-mom';
const KID = 'itest-kid';

async function clearFirestore(): Promise<void> {
  // エミュレータのデータ全削除エンドポイント
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

async function setupFamily() {
  await ensureUserProfile({ userId: DAD, displayName: 'おとうさん', email: null, photoUrl: null });
  await ensureUserProfile({ userId: MOM, displayName: 'おかあさん', email: null, photoUrl: null });
  await ensureUserProfile({ userId: KID, displayName: 'はなこ', email: null, photoUrl: null });

  const { familyId, inviteCode } = await createFamily({
    userId: DAD,
    displayName: 'おとうさん',
    photoUrl: null,
    name: '山田家',
  });

  await joinFamilyByInviteCode({
    userId: KID,
    displayName: 'はなこ',
    photoUrl: null,
    code: inviteCode,
  });

  return { familyId, inviteCode };
}

beforeEach(async () => {
  await clearFirestore();
});

describe('家族の作成と参加', () => {
  it('作成者は自動的に admin になる', async () => {
    const { familyId } = await setupFamily();
    const members = await listMembers(familyId);
    const dad = members.find((m) => m.userId === DAD);
    expect(dad?.role).toBe('admin');
  });

  it('招待コードで参加した人は member になる', async () => {
    const { familyId } = await setupFamily();
    const members = await listMembers(familyId);
    const kid = members.find((m) => m.userId === KID);
    expect(kid?.role).toBe('member');
  });

  it('users/{uid}.familyIds に所属家族が記録される', async () => {
    const { familyId } = await setupFamily();
    const snap = await getDb().collection('users').doc(KID).get();
    expect(snap.data()?.familyIds).toContain(familyId);
  });

  it('memberCount が参加人数と一致する', async () => {
    const { familyId } = await setupFamily();
    const snap = await getDb().collection('families').doc(familyId).get();
    expect(snap.data()?.memberCount).toBe(2);
  });

  it('存在しない招待コードでは参加できない', async () => {
    await setupFamily();
    await expect(
      joinFamilyByInviteCode({
        userId: MOM,
        displayName: 'おかあさん',
        photoUrl: null,
        code: 'NOTACODE12',
      }),
    ).rejects.toThrowError(AppError);
  });

  it('同じ家族に二重参加できない', async () => {
    const { inviteCode } = await setupFamily();
    await expect(
      joinFamilyByInviteCode({
        userId: KID,
        displayName: 'はなこ',
        photoUrl: null,
        code: inviteCode,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('招待コードを再発行すると古いコードは使えなくなる', async () => {
    const { familyId, inviteCode } = await setupFamily();
    await regenerateInviteCode({ familyId, userId: DAD });

    await expect(
      joinFamilyByInviteCode({
        userId: MOM,
        displayName: 'おかあさん',
        photoUrl: null,
        code: inviteCode,
      }),
    ).rejects.toThrowError(AppError);

    const fresh = await getActiveInviteCode(familyId);
    expect(fresh?.code).toBeDefined();
    expect(fresh?.code).not.toBe(inviteCode);

    // 新しいコードでは参加できる
    await joinFamilyByInviteCode({
      userId: MOM,
      displayName: 'おかあさん',
      photoUrl: null,
      code: fresh!.code,
    });
    const members = await listMembers(familyId);
    expect(members).toHaveLength(3);
  });
});

describe('メンバー管理', () => {
  it('admin は member を admin に昇格できる', async () => {
    const { familyId } = await setupFamily();
    await changeMemberRole({
      familyId,
      actorUserId: DAD,
      actorRole: 'admin',
      targetUserId: KID,
      nextRole: 'admin',
    });
    const members = await listMembers(familyId);
    expect(members.find((m) => m.userId === KID)?.role).toBe('admin');
  });

  it('member は権限を変更できない', async () => {
    const { familyId } = await setupFamily();
    await expect(
      changeMemberRole({
        familyId,
        actorUserId: KID,
        actorRole: 'member',
        targetUserId: DAD,
        nextRole: 'member',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('最後の admin は降格できない', async () => {
    const { familyId } = await setupFamily();
    await expect(
      changeMemberRole({
        familyId,
        actorUserId: DAD,
        actorRole: 'admin',
        targetUserId: DAD,
        nextRole: 'member',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('メンバーを削除すると memberCount と familyIds が更新される', async () => {
    const { familyId } = await setupFamily();
    await removeMember({ familyId, actorUserId: DAD, actorRole: 'admin', targetUserId: KID });

    const members = await listMembers(familyId);
    expect(members).toHaveLength(1);

    const family = await getDb().collection('families').doc(familyId).get();
    expect(family.data()?.memberCount).toBe(1);

    const user = await getDb().collection('users').doc(KID).get();
    expect(user.data()?.familyIds).not.toContain(familyId);
  });

  it('最後の admin は家族から抜けられない', async () => {
    const { familyId } = await setupFamily();
    await expect(leaveFamily({ familyId, userId: DAD, role: 'admin' })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('member は自分で家族から抜けられる', async () => {
    const { familyId } = await setupFamily();
    await leaveFamily({ familyId, userId: KID, role: 'member' });
    expect(await listMembers(familyId)).toHaveLength(1);
  });
});

describe('経費の申請から承認までの流れ', () => {
  const form = {
    purchaseDate: toDateInputValue(new Date()),
    merchant: 'スーパーやまだ',
    amount: 4580,
    category: 'food' as const,
    description: '今週の食材',
    receiptStoragePath: null,
  };

  it('下書きとして作成できる', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: false });
    const expense = await getExpense({ familyId, expenseId: id });
    expect(expense?.status).toBe('draft');
    expect(expense?.applicantUserId).toBe(KID);
    expect(expense?.yearMonth).toBe(currentJstMonthKey());
  });

  it('申請すると pending になり、承認待ち件数に反映される', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: false });
    await submitExpense({ familyId, expenseId: id, userId: KID });

    const expense = await getExpense({ familyId, expenseId: id });
    expect(expense?.status).toBe('pending');
    expect(await countPendingExpenses(familyId)).toBe(1);
  });

  it('申請済みは申請者でも編集できない', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: true });

    await expect(
      updateExpense({
        familyId,
        expenseId: id,
        userId: KID,
        input: { ...form, amount: 100 },
        submit: false,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('他人の経費は編集できない', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: false });

    await expect(
      updateExpense({
        familyId,
        expenseId: id,
        userId: DAD,
        input: { ...form, amount: 100 },
        submit: false,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('admin が承認すると reviewedBy と reviewedAt が記録される', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: true });

    await reviewExpense({
      familyId,
      expenseId: id,
      reviewerUserId: DAD,
      reviewerRole: 'admin',
      decision: 'approved',
      adminComment: 'ありがとう',
    });

    const expense = await getExpense({ familyId, expenseId: id });
    expect(expense?.status).toBe('approved');
    expect(expense?.reviewedBy).toBe(DAD);
    expect(expense?.reviewedAt).toBeTruthy();
    expect(expense?.adminComment).toBe('ありがとう');
    expect(await countPendingExpenses(familyId)).toBe(0);
  });

  it('member は承認できない', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: true });

    await expect(
      reviewExpense({
        familyId,
        expenseId: id,
        reviewerUserId: KID,
        reviewerRole: 'member',
        decision: 'approved',
        adminComment: '',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const expense = await getExpense({ familyId, expenseId: id });
    expect(expense?.status).toBe('pending');
  });

  it('二重承認はトランザクションで防がれる', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: true });

    // 2 人の admin が同時に承認しようとする状況
    await changeMemberRole({
      familyId,
      actorUserId: DAD,
      actorRole: 'admin',
      targetUserId: KID,
      nextRole: 'admin',
    });

    const results = await Promise.allSettled([
      reviewExpense({
        familyId,
        expenseId: id,
        reviewerUserId: DAD,
        reviewerRole: 'admin',
        decision: 'approved',
        adminComment: '',
      }),
      reviewExpense({
        familyId,
        expenseId: id,
        reviewerUserId: KID,
        reviewerRole: 'admin',
        decision: 'rejected',
        adminComment: '',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const expense = await getExpense({ familyId, expenseId: id });
    expect(['approved', 'rejected']).toContain(expense?.status);
  });

  it('却下された経費は修正して再申請できる', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: true });

    await reviewExpense({
      familyId,
      expenseId: id,
      reviewerUserId: DAD,
      reviewerRole: 'admin',
      decision: 'rejected',
      adminComment: '金額を確認してください',
    });

    await updateExpense({
      familyId,
      expenseId: id,
      userId: KID,
      input: { ...form, amount: 3580 },
      submit: true,
    });

    const expense = await getExpense({ familyId, expenseId: id });
    expect(expense?.status).toBe('pending');
    expect(expense?.amount).toBe(3580);
    // 再申請時に前回の審査記録はリセットされる
    expect(expense?.reviewedBy).toBeNull();
    expect(expense?.adminComment).toBeNull();
  });

  it('申請を取り下げると下書きに戻る', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: true });
    await withdrawExpense({ familyId, expenseId: id, userId: KID });
    expect((await getExpense({ familyId, expenseId: id }))?.status).toBe('draft');
  });

  it('他人が申請を取り下げることはできない', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: true });
    await expect(
      withdrawExpense({ familyId, expenseId: id, userId: DAD }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('承認済みも削除できる', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: true });
    await reviewExpense({
      familyId,
      expenseId: id,
      reviewerUserId: DAD,
      reviewerRole: 'admin',
      decision: 'approved',
      adminComment: '',
    });

    await deleteExpense({ familyId, expenseId: id, userId: DAD, role: 'admin' });
    expect(await getExpense({ familyId, expenseId: id })).toBeNull();
  });

  it('申請者は自分の承認済みを削除できる', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: true });
    await reviewExpense({
      familyId,
      expenseId: id,
      reviewerUserId: DAD,
      reviewerRole: 'admin',
      decision: 'approved',
      adminComment: '',
    });

    await deleteExpense({ familyId, expenseId: id, userId: KID, role: 'member' });
    expect(await getExpense({ familyId, expenseId: id })).toBeNull();
  });

  it('申請中のものは申請者が直接削除できない (先に取り下げる)', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: true });

    await expect(
      deleteExpense({ familyId, expenseId: id, userId: KID, role: 'member' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('別家族の経費 ID を指定しても取得できない', async () => {
    const { familyId } = await setupFamily();
    const id = await createExpense({ familyId, userId: KID, input: form, submit: false });

    const other = await createFamily({
      userId: MOM,
      displayName: 'おかあさん',
      photoUrl: null,
      name: '鈴木家',
    });

    // 別家族のスコープで同じ ID を引いても見つからない
    expect(await getExpense({ familyId: other.familyId, expenseId: id })).toBeNull();
  });
});

describe('経費の集計', () => {
  const base = {
    purchaseDate: toDateInputValue(new Date()),
    merchant: '店',
    category: 'food' as const,
    description: '',
    receiptStoragePath: null,
  };

  it('ステータス別・カテゴリ別に集計される', async () => {
    const { familyId } = await setupFamily();

    const approved1 = await createExpense({
      familyId,
      userId: KID,
      input: { ...base, amount: 1000 },
      submit: true,
    });
    const approved2 = await createExpense({
      familyId,
      userId: KID,
      input: { ...base, amount: 2000, category: 'daily' },
      submit: true,
    });
    await createExpense({ familyId, userId: KID, input: { ...base, amount: 500 }, submit: true });
    await createExpense({ familyId, userId: KID, input: { ...base, amount: 300 }, submit: false });

    for (const id of [approved1, approved2]) {
      await reviewExpense({
        familyId,
        expenseId: id,
        reviewerUserId: DAD,
        reviewerRole: 'admin',
        decision: 'approved',
        adminComment: '',
      });
    }

    const { summary } = await getMonthlySummary({
      familyId,
      yearMonth: currentJstMonthKey(),
      userId: KID,
      role: 'member',
    });

    expect(summary.approvedTotal).toBe(3000);
    expect(summary.approvedCount).toBe(2);
    expect(summary.pendingTotal).toBe(500);
    expect(summary.pendingCount).toBe(1);
    expect(summary.draftTotal).toBe(300);

    const food = summary.byCategory.find((c) => c.category === 'food');
    const daily = summary.byCategory.find((c) => c.category === 'daily');
    expect(food?.total).toBe(1000);
    expect(daily?.total).toBe(2000);
  });

  it('他人の下書きは一覧に出ない', async () => {
    const { familyId } = await setupFamily();
    await createExpense({ familyId, userId: KID, input: { ...base, amount: 300 }, submit: false });

    const all = await listExpenses({ familyId });
    const visibleToDad = visibleExpenses({ expenses: all, userId: DAD, role: 'admin' });
    const visibleToKid = visibleExpenses({ expenses: all, userId: KID, role: 'member' });

    expect(visibleToDad).toHaveLength(0);
    expect(visibleToKid).toHaveLength(1);
  });
});

describe('カレンダー', () => {
  it('予定を作成して月表示で取得できる', async () => {
    const { familyId } = await setupFamily();
    const today = toDateInputValue(new Date());

    await createEvent({
      familyId,
      userId: DAD,
      input: {
        title: '運動会',
        description: '',
        allDay: false,
        startAt: `${today}T09:00`,
        endAt: `${today}T15:00`,
        location: '体育館',
        assignedUserId: '',
      },
    });

    const events = await listEventsForMonth({ familyId, monthKey: currentJstMonthKey() });
    expect(events).toHaveLength(1);
    expect(events[0]!.title).toBe('運動会');
    expect(events[0]!.location).toBe('体育館');

    const todayEvents = await listTodayEvents(familyId);
    expect(todayEvents).toHaveLength(1);
  });

  it('終日予定は JST の 0:00 から翌日 0:00 として保存される', async () => {
    const { familyId } = await setupFamily();

    await createEvent({
      familyId,
      userId: DAD,
      input: {
        title: '旅行',
        description: '',
        allDay: true,
        startDate: '2026-09-04',
        endDate: '2026-09-06',
        location: '',
        assignedUserId: '',
      },
    });

    const events = await listEventsForMonth({ familyId, monthKey: '2026-09' });
    expect(events).toHaveLength(1);
    expect(events[0]!.startAt).toBe('2026-09-03T15:00:00.000Z'); // JST 9/4 0:00
    expect(events[0]!.endAt).toBe('2026-09-06T15:00:00.000Z'); // JST 9/7 0:00 (排他)
  });

  it('予定を削除できる', async () => {
    const { familyId } = await setupFamily();
    const today = toDateInputValue(new Date());
    const id = await createEvent({
      familyId,
      userId: DAD,
      input: {
        title: '削除される予定',
        description: '',
        allDay: false,
        startAt: `${today}T09:00`,
        endAt: `${today}T10:00`,
        location: '',
        assignedUserId: '',
      },
    });

    await deleteEvent({ familyId, eventId: id });
    expect(await listEventsForMonth({ familyId, monthKey: currentJstMonthKey() })).toHaveLength(0);
  });
});

describe('アルバム', () => {
  it('アルバムを作成・削除できる', async () => {
    const { familyId } = await setupFamily();
    const id = await createAlbum({
      familyId,
      userId: DAD,
      name: '夏の思い出',
      description: '海',
    });

    const albums = await listAlbums(familyId);
    expect(albums).toHaveLength(1);
    expect(albums[0]!.photoCount).toBe(0);

    await deleteAlbum({ familyId, albumId: id });
    expect(await listAlbums(familyId)).toHaveLength(0);
  });
});
