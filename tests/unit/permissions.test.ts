import { describe, expect, it } from 'vitest';
import {
  assertCanEditExpense,
  assertCanReviewExpense,
  canChangeRole,
  canDeleteAlbum,
  canDeleteEvent,
  canDeleteExpense,
  canDeletePhoto,
  canEditExpense,
  canManageFamily,
  canManageInvites,
  canRemoveMember,
  canReviewExpense,
  canSubmitExpense,
  canViewReceipt,
  canWithdrawExpense,
  isAdmin,
} from '@/lib/permissions';
import { AppError } from '@/lib/errors';

/**
 * 権限判定のテスト。
 * firebase/firestore.rules に書いたルールと同じ意味になっていることが重要。
 */

const ADMIN = 'admin' as const;
const MEMBER = 'member' as const;

const applicant = 'user-applicant';
const other = 'user-other';

function expense(status: 'draft' | 'pending' | 'approved' | 'rejected', by = applicant) {
  return { status, applicantUserId: by };
}

describe('管理者判定', () => {
  it('admin だけが管理操作を行える', () => {
    expect(isAdmin(ADMIN)).toBe(true);
    expect(isAdmin(MEMBER)).toBe(false);
    expect(canManageFamily(ADMIN)).toBe(true);
    expect(canManageFamily(MEMBER)).toBe(false);
    expect(canManageInvites(MEMBER)).toBe(false);
  });
});

describe('経費の承認 / 却下', () => {
  it('admin は承認待ちの経費を承認できる', () => {
    expect(canReviewExpense({ role: ADMIN, userId: other, expense: expense('pending') })).toBe(true);
  });

  it('member は承認できない', () => {
    expect(canReviewExpense({ role: MEMBER, userId: other, expense: expense('pending') })).toBe(
      false,
    );
  });

  it('下書きや承認済みは承認できない', () => {
    expect(canReviewExpense({ role: ADMIN, userId: other, expense: expense('draft') })).toBe(false);
    expect(canReviewExpense({ role: ADMIN, userId: other, expense: expense('approved') })).toBe(
      false,
    );
    expect(canReviewExpense({ role: ADMIN, userId: other, expense: expense('rejected') })).toBe(
      false,
    );
  });

  it('member が承認しようとすると forbidden になる', () => {
    expect(() =>
      assertCanReviewExpense({ role: MEMBER, userId: other, expense: expense('pending') }),
    ).toThrowError(AppError);

    try {
      assertCanReviewExpense({ role: MEMBER, userId: other, expense: expense('pending') });
    } catch (error) {
      expect((error as AppError).code).toBe('forbidden');
    }
  });

  it('処理済みの経費を再度承認しようとすると conflict になる', () => {
    try {
      assertCanReviewExpense({ role: ADMIN, userId: other, expense: expense('approved') });
      throw new Error('ここには到達しないはず');
    } catch (error) {
      expect((error as AppError).code).toBe('conflict');
    }
  });
});

describe('経費の編集', () => {
  it('申請者は下書きを編集できる', () => {
    expect(canEditExpense({ role: MEMBER, userId: applicant, expense: expense('draft') })).toBe(
      true,
    );
  });

  it('却下されたものは修正して再申請できる', () => {
    expect(canEditExpense({ role: MEMBER, userId: applicant, expense: expense('rejected') })).toBe(
      true,
    );
  });

  it('申請済み (pending) になったら申請者でも編集できない', () => {
    expect(canEditExpense({ role: MEMBER, userId: applicant, expense: expense('pending') })).toBe(
      false,
    );
  });

  it('承認済みは編集できない', () => {
    expect(canEditExpense({ role: ADMIN, userId: applicant, expense: expense('approved') })).toBe(
      false,
    );
  });

  it('他人の経費は admin でも編集できない (改ざん防止)', () => {
    expect(canEditExpense({ role: ADMIN, userId: other, expense: expense('draft') })).toBe(false);
  });

  it('申請済みを編集しようとすると conflict になる', () => {
    try {
      assertCanEditExpense({ role: MEMBER, userId: applicant, expense: expense('pending') });
      throw new Error('ここには到達しないはず');
    } catch (error) {
      expect((error as AppError).code).toBe('conflict');
    }
  });
});

describe('経費の申請 / 取り下げ / 削除', () => {
  it('申請できるのは自分の下書き・却下のみ', () => {
    expect(canSubmitExpense({ userId: applicant, expense: expense('draft') })).toBe(true);
    expect(canSubmitExpense({ userId: applicant, expense: expense('rejected') })).toBe(true);
    expect(canSubmitExpense({ userId: applicant, expense: expense('pending') })).toBe(false);
    expect(canSubmitExpense({ userId: other, expense: expense('draft') })).toBe(false);
  });

  it('取り下げできるのは自分の申請中のものだけ', () => {
    expect(canWithdrawExpense({ userId: applicant, expense: expense('pending') })).toBe(true);
    expect(canWithdrawExpense({ userId: other, expense: expense('pending') })).toBe(false);
    expect(canWithdrawExpense({ userId: applicant, expense: expense('draft') })).toBe(false);
  });

  it('承認済みは誰も削除できない (家計の記録として残す)', () => {
    expect(canDeleteExpense({ role: ADMIN, userId: applicant, expense: expense('approved') })).toBe(
      false,
    );
  });

  it('admin は承認済み以外を削除できる', () => {
    expect(canDeleteExpense({ role: ADMIN, userId: other, expense: expense('pending') })).toBe(true);
  });

  it('申請者は申請中のものを直接削除できない (先に取り下げる)', () => {
    expect(canDeleteExpense({ role: MEMBER, userId: applicant, expense: expense('pending') })).toBe(
      false,
    );
  });
});

describe('領収書の閲覧', () => {
  it('申請者本人と admin だけが見られる', () => {
    expect(canViewReceipt({ role: MEMBER, userId: applicant, expense: expense('pending') })).toBe(
      true,
    );
    expect(canViewReceipt({ role: ADMIN, userId: other, expense: expense('pending') })).toBe(true);
    expect(canViewReceipt({ role: MEMBER, userId: other, expense: expense('pending') })).toBe(false);
  });
});

describe('予定・写真・アルバム', () => {
  it('予定の削除は作成者か admin', () => {
    expect(canDeleteEvent({ role: MEMBER, userId: 'u1', event: { createdBy: 'u1' } })).toBe(true);
    expect(canDeleteEvent({ role: MEMBER, userId: 'u2', event: { createdBy: 'u1' } })).toBe(false);
    expect(canDeleteEvent({ role: ADMIN, userId: 'u2', event: { createdBy: 'u1' } })).toBe(true);
  });

  it('写真の削除は投稿者か admin', () => {
    expect(canDeletePhoto({ role: MEMBER, userId: 'u1', photo: { uploadedBy: 'u1' } })).toBe(true);
    expect(canDeletePhoto({ role: MEMBER, userId: 'u2', photo: { uploadedBy: 'u1' } })).toBe(false);
    expect(canDeletePhoto({ role: ADMIN, userId: 'u2', photo: { uploadedBy: 'u1' } })).toBe(true);
  });

  it('アルバムの削除は作成者か admin', () => {
    expect(canDeleteAlbum({ role: MEMBER, userId: 'u2', album: { createdBy: 'u1' } })).toBe(false);
  });
});

describe('メンバー管理', () => {
  it('member はメンバーを削除できない', () => {
    expect(
      canRemoveMember({
        actorRole: MEMBER,
        actorUserId: 'u1',
        targetUserId: 'u2',
        targetRole: MEMBER,
        adminCount: 2,
      }),
    ).toBe(false);
  });

  it('自分自身は削除できない', () => {
    expect(
      canRemoveMember({
        actorRole: ADMIN,
        actorUserId: 'u1',
        targetUserId: 'u1',
        targetRole: ADMIN,
        adminCount: 2,
      }),
    ).toBe(false);
  });

  it('最後の管理者は削除できない (管理者ゼロを防ぐ)', () => {
    expect(
      canRemoveMember({
        actorRole: ADMIN,
        actorUserId: 'u1',
        targetUserId: 'u2',
        targetRole: ADMIN,
        adminCount: 1,
      }),
    ).toBe(false);
  });

  it('管理者が 2 人いれば片方を一般に降格できる', () => {
    expect(
      canChangeRole({
        actorRole: ADMIN,
        actorUserId: 'u1',
        targetUserId: 'u2',
        targetRole: ADMIN,
        nextRole: MEMBER,
        adminCount: 2,
      }),
    ).toBe(true);
  });

  it('管理者が 1 人のときは降格できない', () => {
    expect(
      canChangeRole({
        actorRole: ADMIN,
        actorUserId: 'u1',
        targetUserId: 'u2',
        targetRole: ADMIN,
        nextRole: MEMBER,
        adminCount: 1,
      }),
    ).toBe(false);
  });

  it('member は権限を変更できない', () => {
    expect(
      canChangeRole({
        actorRole: MEMBER,
        actorUserId: 'u1',
        targetUserId: 'u2',
        targetRole: MEMBER,
        nextRole: ADMIN,
        adminCount: 1,
      }),
    ).toBe(false);
  });
});
