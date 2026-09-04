import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Firestore Security Rules のテスト。
 *
 * 実行方法:
 *   npm run test:rules
 *   (firebase emulators:exec が Firestore エミュレータを起動してから実行する)
 *
 * ここで確認したいのは「アプリのコードを通さずに Firestore を直接叩かれても
 * 家族のデータが守られるか」。Server Action の権限チェックとは独立した防御層。
 */

const PROJECT_ID = 'uchi-plus-demo';

// 山田家 (テスト対象の家族)
const FAMILY_A = 'family-yamada';
const DAD = 'user-dad'; // admin
const MOM = 'user-mom'; // admin
const KID = 'user-kid'; // member

// 別の家族 (境界のテスト用)
const FAMILY_B = 'family-suzuki';
const OUTSIDER = 'user-outsider'; // family-suzuki の member

let testEnv: RulesTestEnvironment;

function ctx(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

function anon() {
  return testEnv.unauthenticatedContext().firestore();
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firebase/firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // ルールを無効化した状態で初期データを作る (Admin SDK で作る状況を再現)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, 'families', FAMILY_A), {
      name: '山田家',
      createdBy: DAD,
      inviteCode: 'ABCD234XYZ',
      memberCount: 3,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'families', FAMILY_A, 'members', DAD), {
      userId: DAD,
      displayName: 'おとうさん',
      role: 'admin',
      joinedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'families', FAMILY_A, 'members', MOM), {
      userId: MOM,
      displayName: 'おかあさん',
      role: 'admin',
      joinedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'families', FAMILY_A, 'members', KID), {
      userId: KID,
      displayName: 'こども',
      role: 'member',
      joinedAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'families', FAMILY_B), {
      name: '鈴木家',
      createdBy: OUTSIDER,
      memberCount: 1,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'families', FAMILY_B, 'members', OUTSIDER), {
      userId: OUTSIDER,
      displayName: 'すずきさん',
      role: 'member',
      joinedAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'users', KID), {
      displayName: 'こども',
      email: 'kid@example.com',
      familyIds: [FAMILY_A],
      lastActiveFamilyId: FAMILY_A,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'inviteCodes', 'ABCD234XYZ'), {
      familyId: FAMILY_A,
      createdBy: DAD,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    });

    // 山田家の予定
    await setDoc(doc(db, 'families', FAMILY_A, 'events', 'event-1'), {
      familyId: FAMILY_A,
      title: '運動会',
      startAt: Timestamp.now(),
      endAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      allDay: false,
      location: null,
      description: null,
      assignedUserId: null,
      createdBy: KID,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // 山田家の経費 (こどもが申請、承認待ち)
    await setDoc(doc(db, 'families', FAMILY_A, 'expenses', 'expense-pending'), {
      familyId: FAMILY_A,
      applicantUserId: KID,
      purchaseDate: Timestamp.now(),
      yearMonth: '2026-09',
      merchant: 'スーパーやまだ',
      amount: 4580,
      category: 'food',
      description: null,
      receiptStoragePath: null,
      status: 'pending',
      adminComment: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // こどもの下書き
    await setDoc(doc(db, 'families', FAMILY_A, 'expenses', 'expense-draft'), {
      familyId: FAMILY_A,
      applicantUserId: KID,
      purchaseDate: Timestamp.now(),
      yearMonth: '2026-09',
      merchant: '文房具店',
      amount: 800,
      category: 'education',
      description: null,
      receiptStoragePath: null,
      status: 'draft',
      adminComment: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // 承認済み (削除できないことの確認用)
    await setDoc(doc(db, 'families', FAMILY_A, 'expenses', 'expense-approved'), {
      familyId: FAMILY_A,
      applicantUserId: KID,
      purchaseDate: Timestamp.now(),
      yearMonth: '2026-09',
      merchant: '薬局',
      amount: 1200,
      category: 'medical',
      description: null,
      receiptStoragePath: null,
      status: 'approved',
      adminComment: null,
      reviewedBy: DAD,
      reviewedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // 鈴木家の経費 (家族分離の確認用)
    await setDoc(doc(db, 'families', FAMILY_B, 'expenses', 'expense-other'), {
      familyId: FAMILY_B,
      applicantUserId: OUTSIDER,
      purchaseDate: Timestamp.now(),
      yearMonth: '2026-09',
      merchant: 'よそのお店',
      amount: 9999,
      category: 'other',
      description: null,
      receiptStoragePath: null,
      status: 'pending',
      adminComment: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
});

// ---------------------------------------------------------------------------
describe('未ログインユーザー', () => {
  it('家族の情報を読めない', async () => {
    await assertFails(getDoc(doc(anon(), 'families', FAMILY_A)));
  });

  it('予定を読めない', async () => {
    await assertFails(getDocs(collection(anon(), 'families', FAMILY_A, 'events')));
  });

  it('経費を読めない', async () => {
    await assertFails(getDocs(collection(anon(), 'families', FAMILY_A, 'expenses')));
  });

  it('予定を作成できない', async () => {
    await assertFails(
      setDoc(doc(anon(), 'families', FAMILY_A, 'events', 'hack'), {
        familyId: FAMILY_A,
        title: '侵入',
        startAt: Timestamp.now(),
        endAt: Timestamp.now(),
        allDay: false,
        createdBy: 'anonymous',
      }),
    );
  });

  it('ユーザー情報を読めない', async () => {
    await assertFails(getDoc(doc(anon(), 'users', KID)));
  });
});

// ---------------------------------------------------------------------------
describe('家族の分離 (別の家族のデータ)', () => {
  it('別家族のユーザーは家族ドキュメントを読めない', async () => {
    await assertFails(getDoc(doc(ctx(OUTSIDER), 'families', FAMILY_A)));
  });

  it('別家族のユーザーは経費一覧を読めない', async () => {
    await assertFails(getDocs(collection(ctx(OUTSIDER), 'families', FAMILY_A, 'expenses')));
  });

  it('別家族のユーザーは予定を読めない', async () => {
    await assertFails(getDoc(doc(ctx(OUTSIDER), 'families', FAMILY_A, 'events', 'event-1')));
  });

  it('別家族のユーザーはメンバー一覧を読めない', async () => {
    await assertFails(getDocs(collection(ctx(OUTSIDER), 'families', FAMILY_A, 'members')));
  });

  it('別家族のユーザーは予定を書き込めない', async () => {
    await assertFails(
      setDoc(doc(ctx(OUTSIDER), 'families', FAMILY_A, 'events', 'intrusion'), {
        familyId: FAMILY_A,
        title: '侵入',
        startAt: Timestamp.now(),
        endAt: Timestamp.now(),
        allDay: false,
        createdBy: OUTSIDER,
      }),
    );
  });

  it('自分の家族のデータは読める (対比)', async () => {
    await assertSucceeds(getDoc(doc(ctx(OUTSIDER), 'families', FAMILY_B)));
  });

  it('山田家のメンバーは鈴木家の経費を読めない', async () => {
    await assertFails(
      getDoc(doc(ctx(KID), 'families', FAMILY_B, 'expenses', 'expense-other')),
    );
  });

  it('familyId フィールドを偽装しても別家族には書き込めない', async () => {
    // パス上の familyId (FAMILY_A) で判定するので、
    // ドキュメント内の familyId を書き換えても意味がない
    await assertFails(
      setDoc(doc(ctx(OUTSIDER), 'families', FAMILY_A, 'events', 'spoof'), {
        familyId: FAMILY_B, // 自分の家族 ID を書いてみる
        title: 'なりすまし',
        startAt: Timestamp.now(),
        endAt: Timestamp.now(),
        allDay: false,
        createdBy: OUTSIDER,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
describe('家族メンバー (member 権限)', () => {
  it('自分の家族の情報を読める', async () => {
    await assertSucceeds(getDoc(doc(ctx(KID), 'families', FAMILY_A)));
  });

  it('メンバー一覧を読める', async () => {
    await assertSucceeds(getDocs(collection(ctx(KID), 'families', FAMILY_A, 'members')));
  });

  it('家族の名前を変更できない (admin 専用)', async () => {
    await assertFails(
      updateDoc(doc(ctx(KID), 'families', FAMILY_A), {
        name: 'こども家',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('他のメンバーを削除できない', async () => {
    await assertFails(deleteDoc(doc(ctx(KID), 'families', FAMILY_A, 'members', MOM)));
  });

  it('自分を管理者に昇格できない', async () => {
    await assertFails(
      updateDoc(doc(ctx(KID), 'families', FAMILY_A, 'members', KID), { role: 'admin' }),
    );
  });

  it('自分の表示名は変更できる', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(KID), 'families', FAMILY_A, 'members', KID), {
        displayName: 'たろう',
      }),
    );
  });

  it('他人の表示名は変更できない', async () => {
    await assertFails(
      updateDoc(doc(ctx(KID), 'families', FAMILY_A, 'members', MOM), {
        displayName: 'いたずら',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
describe('管理者 (admin 権限)', () => {
  it('家族の名前を変更できる', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(DAD), 'families', FAMILY_A), {
        name: '山田ファミリー',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('招待コードを直接書き換えることはできない (サーバー経由のみ)', async () => {
    await assertFails(
      updateDoc(doc(ctx(DAD), 'families', FAMILY_A), { inviteCode: 'HACKED1234' }),
    );
  });

  it('他のメンバーの権限を変更できる', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(DAD), 'families', FAMILY_A, 'members', KID), { role: 'admin' }),
    );
  });

  it('自分自身の権限は変更できない (管理者ゼロを防ぐ)', async () => {
    await assertFails(
      updateDoc(doc(ctx(DAD), 'families', FAMILY_A, 'members', DAD), { role: 'member' }),
    );
  });

  it('他のメンバーを削除できる', async () => {
    await assertSucceeds(deleteDoc(doc(ctx(DAD), 'families', FAMILY_A, 'members', KID)));
  });

  it('自分自身は削除できない', async () => {
    await assertFails(deleteDoc(doc(ctx(DAD), 'families', FAMILY_A, 'members', DAD)));
  });
});

// ---------------------------------------------------------------------------
describe('経費の承認 (最重要)', () => {
  it('member は経費を承認できない', async () => {
    await assertFails(
      updateDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'expense-pending'), {
        status: 'approved',
        reviewedBy: KID,
        reviewedAt: serverTimestamp(),
        adminComment: null,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('申請者が自分で status を approved にできない', async () => {
    await assertFails(
      updateDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'expense-draft'), {
        status: 'approved',
      }),
    );
  });

  it('admin は承認待ちの経費を承認できる', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(DAD), 'families', FAMILY_A, 'expenses', 'expense-pending'), {
        status: 'approved',
        adminComment: 'OK です',
        reviewedBy: DAD,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('admin は却下もできる', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(MOM), 'families', FAMILY_A, 'expenses', 'expense-pending'), {
        status: 'rejected',
        adminComment: '個人的な買い物のため',
        reviewedBy: MOM,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('reviewedBy を他人の名前で書けない (詐称防止)', async () => {
    await assertFails(
      updateDoc(doc(ctx(DAD), 'families', FAMILY_A, 'expenses', 'expense-pending'), {
        status: 'approved',
        adminComment: null,
        reviewedBy: MOM, // 実際に操作しているのは DAD
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('承認と同時に金額を書き換えられない', async () => {
    await assertFails(
      updateDoc(doc(ctx(DAD), 'families', FAMILY_A, 'expenses', 'expense-pending'), {
        status: 'approved',
        amount: 1, // 承認時に金額を改ざん
        adminComment: null,
        reviewedBy: DAD,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('下書きをいきなり承認できない (申請前)', async () => {
    await assertFails(
      updateDoc(doc(ctx(DAD), 'families', FAMILY_A, 'expenses', 'expense-draft'), {
        status: 'approved',
        adminComment: null,
        reviewedBy: DAD,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('承認済みをもう一度承認できない (二重承認の防止)', async () => {
    await assertFails(
      updateDoc(doc(ctx(DAD), 'families', FAMILY_A, 'expenses', 'expense-approved'), {
        status: 'approved',
        adminComment: null,
        reviewedBy: DAD,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('別家族の admin は承認できない', async () => {
    await assertFails(
      updateDoc(doc(ctx(OUTSIDER), 'families', FAMILY_A, 'expenses', 'expense-pending'), {
        status: 'approved',
        adminComment: null,
        reviewedBy: OUTSIDER,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
describe('経費の作成と編集', () => {
  const validExpense = {
    familyId: FAMILY_A,
    applicantUserId: KID,
    purchaseDate: Timestamp.now(),
    yearMonth: '2026-09',
    merchant: 'コンビニ',
    amount: 500,
    category: 'food',
    description: null,
    receiptStoragePath: null,
    status: 'draft',
    adminComment: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  it('自分名義の下書きを作成できる', async () => {
    await assertSucceeds(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'new-1'), validExpense),
    );
  });

  it('他人名義では作成できない', async () => {
    await assertFails(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'new-2'), {
        ...validExpense,
        applicantUserId: MOM,
      }),
    );
  });

  it('最初から approved の経費は作成できない', async () => {
    await assertFails(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'new-3'), {
        ...validExpense,
        status: 'approved',
      }),
    );
  });

  it('審査済みの情報を付けて作成できない', async () => {
    await assertFails(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'new-4'), {
        ...validExpense,
        reviewedBy: DAD,
      }),
    );
  });

  it('金額が 0 以下の経費は作成できない', async () => {
    await assertFails(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'new-5'), {
        ...validExpense,
        amount: 0,
      }),
    );
  });

  it('存在しないカテゴリでは作成できない', async () => {
    await assertFails(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'new-6'), {
        ...validExpense,
        category: 'gambling',
      }),
    );
  });

  it('別家族の領収書パスを指定できない', async () => {
    await assertFails(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'new-7'), {
        ...validExpense,
        receiptStoragePath: `families/${FAMILY_B}/receipts/3f2504e0-4f89-11d3-9a0c-0305e82c3301.webp`,
      }),
    );
  });

  it('申請済み (pending) の経費は申請者でも編集できない', async () => {
    await assertFails(
      updateDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'expense-pending'), {
        amount: 100,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('下書きは申請者が編集できる', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'expense-draft'), {
        amount: 900,
        merchant: '文房具店 (修正)',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('他人の下書きは編集できない', async () => {
    await assertFails(
      updateDoc(doc(ctx(MOM), 'families', FAMILY_A, 'expenses', 'expense-draft'), {
        amount: 100,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('承認済みの経費は削除できない (家計の記録として残す)', async () => {
    await assertFails(
      deleteDoc(doc(ctx(DAD), 'families', FAMILY_A, 'expenses', 'expense-approved')),
    );
  });

  it('自分の下書きは削除できる', async () => {
    await assertSucceeds(
      deleteDoc(doc(ctx(KID), 'families', FAMILY_A, 'expenses', 'expense-draft')),
    );
  });
});

// ---------------------------------------------------------------------------
describe('予定・写真', () => {
  it('メンバーは予定を作成できる', async () => {
    await assertSucceeds(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'events', 'new-event'), {
        familyId: FAMILY_A,
        title: '習い事',
        description: null,
        location: null,
        assignedUserId: null,
        startAt: Timestamp.now(),
        endAt: Timestamp.fromMillis(Date.now() + 3_600_000),
        allDay: false,
        createdBy: KID,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('createdBy を他人にして作成できない', async () => {
    await assertFails(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'events', 'fake-event'), {
        familyId: FAMILY_A,
        title: 'なりすまし',
        description: null,
        location: null,
        assignedUserId: null,
        startAt: Timestamp.now(),
        endAt: Timestamp.now(),
        allDay: false,
        createdBy: DAD,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('終了が開始より前の予定は作成できない', async () => {
    await assertFails(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'events', 'bad-range'), {
        familyId: FAMILY_A,
        title: '逆転',
        description: null,
        location: null,
        assignedUserId: null,
        startAt: Timestamp.fromMillis(Date.now() + 3_600_000),
        endAt: Timestamp.now(),
        allDay: false,
        createdBy: KID,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('作成者は自分の予定を削除できる', async () => {
    await assertSucceeds(deleteDoc(doc(ctx(KID), 'families', FAMILY_A, 'events', 'event-1')));
  });

  it('作成者でない member は削除できない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'families', FAMILY_A, 'members', 'user-sibling'), {
        userId: 'user-sibling',
        displayName: 'きょうだい',
        role: 'member',
        joinedAt: Timestamp.now(),
      });
    });
    await assertFails(
      deleteDoc(doc(ctx('user-sibling'), 'families', FAMILY_A, 'events', 'event-1')),
    );
  });

  it('admin は他人の予定も削除できる', async () => {
    await assertSucceeds(deleteDoc(doc(ctx(DAD), 'families', FAMILY_A, 'events', 'event-1')));
  });

  it('保存先が別家族の写真は登録できない', async () => {
    await assertFails(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'photos', 'photo-1'), {
        familyId: FAMILY_A,
        albumId: null,
        storagePath: `families/${FAMILY_B}/photos/3f2504e0-4f89-11d3-9a0c-0305e82c3301.webp`,
        thumbnailStoragePath: null,
        caption: null,
        takenAt: Timestamp.now(),
        uploadedBy: KID,
        createdAt: Timestamp.now(),
      }),
    );
  });

  it('正しい保存先なら写真を登録できる', async () => {
    await assertSucceeds(
      setDoc(doc(ctx(KID), 'families', FAMILY_A, 'photos', 'photo-2'), {
        familyId: FAMILY_A,
        albumId: null,
        storagePath: `families/${FAMILY_A}/photos/3f2504e0-4f89-11d3-9a0c-0305e82c3301.webp`,
        thumbnailStoragePath: null,
        caption: null,
        takenAt: Timestamp.now(),
        uploadedBy: KID,
        createdAt: Timestamp.now(),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
describe('ユーザー情報と招待コード', () => {
  it('自分のユーザー情報は読める', async () => {
    await assertSucceeds(getDoc(doc(ctx(KID), 'users', KID)));
  });

  it('他人のユーザー情報は読めない', async () => {
    await assertFails(getDoc(doc(ctx(DAD), 'users', KID)));
  });

  it('familyIds を自分で書き換えられない (家族への不正参加の防止)', async () => {
    await assertFails(
      updateDoc(doc(ctx(KID), 'users', KID), { familyIds: [FAMILY_A, FAMILY_B] }),
    );
  });

  it('招待コードはクライアントから読めない (総当たり防止)', async () => {
    await assertFails(getDoc(doc(ctx(KID), 'inviteCodes', 'ABCD234XYZ')));
    await assertFails(getDoc(doc(ctx(OUTSIDER), 'inviteCodes', 'ABCD234XYZ')));
  });

  it('招待コードを作成できない', async () => {
    await assertFails(
      setDoc(doc(ctx(DAD), 'inviteCodes', 'FAKECODE12'), { familyId: FAMILY_A }),
    );
  });
});

// ---------------------------------------------------------------------------
describe('未定義のパス', () => {
  it('ルールに書かれていないコレクションは読めない', async () => {
    await assertFails(getDoc(doc(ctx(DAD), 'adminSettings', 'anything')));
  });

  it('ルールに書かれていないコレクションに書き込めない', async () => {
    await assertFails(setDoc(doc(ctx(DAD), 'adminSettings', 'anything'), { hacked: true }));
  });
});
