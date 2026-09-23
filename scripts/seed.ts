/**
 * 開発用のシードデータ投入スクリプト。
 *
 *   npm run seed
 *
 * 前提: Firebase Emulator Suite が起動していること (npm run emulators)。
 *
 * 【安全装置】
 *   このスクリプトは「エミュレータに接続している」ことを確認してからでないと
 *   1 件も書き込まない。本番の Firestore を誤って上書きする事故を防ぐため。
 *
 * 作成されるもの:
 *   - 山田家 (父: admin / 母: admin / 子: member)
 *   - カレンダーの予定 数件
 *   - 経費 (draft / pending / approved / rejected それぞれ)
 *   - アルバムと写真 (ダミー画像)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// .env.local を読み込む
// (next dev は自動で読むが、このスクリプトは単体で動くので自前で読む)
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const envPath = join(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // 引用符を外す
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // すでに指定されている環境変数を上書きしない
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

// ---------------------------------------------------------------------------
// 安全装置: エミュレータ以外への接続を拒否する
// ---------------------------------------------------------------------------
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'uchi-plus-demo';
const BUCKET = process.env.GCS_BUCKET ?? `${PROJECT_ID}.appspot.com`;

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';

function assertEmulator(): void {
  const looksLikeEmulator =
    process.env.FIRESTORE_EMULATOR_HOST?.includes('127.0.0.1') ||
    process.env.FIRESTORE_EMULATOR_HOST?.includes('localhost');

  if (!looksLikeEmulator) {
    console.error(
      '\n中止しました: FIRESTORE_EMULATOR_HOST がローカルを指していません。\n' +
        'このスクリプトはエミュレータ専用です。本番データを壊さないため実行しません。\n',
    );
    process.exit(1);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn(
      '警告: GOOGLE_APPLICATION_CREDENTIALS が設定されています。' +
        'エミュレータ利用時は不要です。\n',
    );
  }
}

assertEmulator();

// エミュレータへ接続する場合、Admin SDK は認証情報を必要としない
// (*_EMULATOR_HOST 環境変数を見て自動的にモックの認証情報を使う)
const app: App = initializeApp({
  projectId: PROJECT_ID,
  storageBucket: BUCKET,
});

const db = getFirestore(app);
const auth = getAuth(app);
const bucket = getStorage(app).bucket(BUCKET);

db.settings({ ignoreUndefinedProperties: true });

// ---------------------------------------------------------------------------
// 投入するデータ
// ---------------------------------------------------------------------------
const FAMILY_ID = 'seed-family-yamada';
const FAMILY_NAME = '山田家';
const INVITE_CODE = 'YAMADA2026';

const USERS = [
  {
    uid: 'seed-user-dad',
    email: 'dad@example.com',
    password: 'password123',
    displayName: 'おとうさん',
    role: 'admin' as const,
  },
  {
    uid: 'seed-user-mom',
    email: 'mom@example.com',
    password: 'password123',
    displayName: 'おかあさん',
    role: 'admin' as const,
  },
  {
    uid: 'seed-user-kid',
    email: 'kid@example.com',
    password: 'password123',
    displayName: 'はなこ',
    role: 'member' as const,
  },
];

/** JST の「今日」を基準に日付を作る */
function jstDate(dayOffset: number, hour = 0, minute = 0): Date {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 3600_000);
  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate() + dayOffset;
  // JST の壁掛け時刻を UTC に直す (JST = UTC+9)
  return new Date(Date.UTC(y, m, d, hour - 9, minute));
}

function yearMonthOf(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 3600_000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function uploadSeedImage(fileName: string, storagePath: string): Promise<number> {
  const buffer = readFileSync(join(__dirname, 'seed-assets', fileName));
  await bucket.file(storagePath).save(buffer, {
    contentType: 'image/jpeg',
    resumable: false,
  });
  return buffer.byteLength;
}

/**
 * 同じシードを何度実行しても同じ状態になるように、
 * 先にシード用の家族データを消してから作り直す。
 * (消すのはシードが作った家族だけ。手で作ったデータには触らない)
 */
async function resetSeedData(): Promise<void> {
  await db.recursiveDelete(db.collection('families').doc(FAMILY_ID));
  await db.collection('inviteCodes').doc(INVITE_CODE).delete();
  for (const user of USERS) {
    await db.collection('users').doc(user.uid).delete();
  }

  // Cloud Storage 上のシード画像も消す (孤児オブジェクトを残さない)
  try {
    await bucket.deleteFiles({ prefix: `families/${FAMILY_ID}/` });
  } catch {
    // エミュレータ起動直後などで失敗しても続行する
  }
}

async function main(): Promise<void> {
  console.log(`シードデータを投入します (project: ${PROJECT_ID})`);

  await resetSeedData();

  // -------------------------------------------------------------------------
  // 1) Authentication のユーザー
  // -------------------------------------------------------------------------
  for (const user of USERS) {
    try {
      await auth.deleteUser(user.uid);
    } catch {
      // 未作成なら無視
    }
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: user.password,
      displayName: user.displayName,
      emailVerified: true,
    });
    console.log(`  ユーザー作成: ${user.displayName} <${user.email}>`);
  }

  // -------------------------------------------------------------------------
  // 2) 家族とメンバー
  // -------------------------------------------------------------------------
  const now = Timestamp.now();
  const batch = db.batch();

  batch.set(db.collection('families').doc(FAMILY_ID), {
    name: FAMILY_NAME,
    createdBy: USERS[0]!.uid,
    inviteCode: INVITE_CODE,
    inviteCodeExpiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000),
    memberCount: USERS.length,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(db.collection('inviteCodes').doc(INVITE_CODE), {
    familyId: FAMILY_ID,
    createdBy: USERS[0]!.uid,
    createdAt: now,
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000),
  });

  for (const user of USERS) {
    batch.set(db.collection('families').doc(FAMILY_ID).collection('members').doc(user.uid), {
      userId: user.uid,
      displayName: user.displayName,
      photoUrl: null,
      role: user.role,
      joinedAt: now,
    });
    batch.set(db.collection('users').doc(user.uid), {
      displayName: user.displayName,
      email: user.email,
      photoUrl: null,
      familyIds: [FAMILY_ID],
      lastActiveFamilyId: FAMILY_ID,
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();
  console.log(`  家族作成: ${FAMILY_NAME} (招待コード: ${INVITE_CODE})`);

  // -------------------------------------------------------------------------
  // 3) カレンダーの予定
  // -------------------------------------------------------------------------
  const events = [
    {
      title: '保育園の運動会',
      startAt: jstDate(0, 9, 0),
      endAt: jstDate(0, 15, 0),
      allDay: false,
      location: '第一体育館',
      description: 'お弁当とレジャーシートを持っていく',
      assignedUserId: null,
      createdBy: USERS[1]!.uid,
    },
    {
      title: '歯医者',
      startAt: jstDate(0, 17, 30),
      endAt: jstDate(0, 18, 30),
      allDay: false,
      location: 'やまだ歯科',
      description: null,
      assignedUserId: USERS[2]!.uid,
      createdBy: USERS[1]!.uid,
    },
    {
      title: '燃えるゴミ',
      startAt: jstDate(1, 0, 0),
      endAt: jstDate(2, 0, 0),
      allDay: true,
      location: null,
      description: '前の晩に出しておく',
      assignedUserId: USERS[0]!.uid,
      createdBy: USERS[0]!.uid,
    },
    {
      title: '家族で温泉旅行',
      startAt: jstDate(5, 0, 0),
      endAt: jstDate(8, 0, 0),
      allDay: true,
      location: '草津温泉',
      description: '2泊3日。チェックイン15時。',
      assignedUserId: null,
      createdBy: USERS[0]!.uid,
    },
    {
      title: '授業参観',
      startAt: jstDate(12, 13, 30),
      endAt: jstDate(12, 15, 0),
      allDay: false,
      location: '小学校',
      description: null,
      assignedUserId: USERS[1]!.uid,
      createdBy: USERS[1]!.uid,
    },
    {
      title: 'おとうさんの誕生日',
      startAt: jstDate(20, 0, 0),
      endAt: jstDate(21, 0, 0),
      allDay: true,
      location: null,
      description: 'ケーキを予約する',
      assignedUserId: USERS[0]!.uid,
      createdBy: USERS[2]!.uid,
    },
  ];

  for (const event of events) {
    await db
      .collection('families')
      .doc(FAMILY_ID)
      .collection('events')
      .add({
        familyId: FAMILY_ID,
        ...event,
        startAt: Timestamp.fromDate(event.startAt),
        endAt: Timestamp.fromDate(event.endAt),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
  console.log(`  予定を ${events.length} 件作成`);

  // -------------------------------------------------------------------------
  // 4) アルバムと写真
  // -------------------------------------------------------------------------
  const albumRef = db.collection('families').doc(FAMILY_ID).collection('albums').doc();
  await albumRef.set({
    familyId: FAMILY_ID,
    name: '2026年 夏の思い出',
    description: '海と花火大会',
    coverPhotoId: null,
    coverStoragePath: null,
    photoCount: 0,
    createdBy: USERS[1]!.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const captions = [
    '海に行ってきました',
    '花火大会',
    'おじいちゃんの家で',
    '公園でピクニック',
    'はじめての自転車',
    '運動会のリレー',
  ];

  let albumPhotoCount = 0;
  let lastPhotoId: string | null = null;
  let lastPhotoPath: string | null = null;

  for (const [index, caption] of captions.entries()) {
    const objectId = randomUUID();
    const storagePath = `families/${FAMILY_ID}/photos/${objectId}.jpg`;
    const thumbnailPath = `families/${FAMILY_ID}/thumbnails/${objectId}.jpg`;
    const byteSize = await uploadSeedImage(`photo-${index + 1}.jpg`, storagePath);
    await uploadSeedImage(`photo-${index + 1}.jpg`, thumbnailPath);

    // 前半 3 枚はアルバムに入れ、残りは未分類にする
    const albumId = index < 3 ? albumRef.id : null;
    const photoRef = db.collection('families').doc(FAMILY_ID).collection('photos').doc();
    await photoRef.set({
      familyId: FAMILY_ID,
      albumId,
      storagePath,
      thumbnailStoragePath: thumbnailPath,
      caption,
      takenAt: Timestamp.fromDate(jstDate(-index * 3, 12, 0)),
      width: 1200,
      height: 800,
      byteSize,
      contentType: 'image/jpeg',
      uploadedBy: USERS[index % USERS.length]!.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    if (albumId) {
      albumPhotoCount += 1;
      lastPhotoId = photoRef.id;
      lastPhotoPath = thumbnailPath;
    }
  }

  await albumRef.update({
    photoCount: albumPhotoCount,
    coverPhotoId: lastPhotoId,
    coverStoragePath: lastPhotoPath,
  });
  console.log(`  写真を ${captions.length} 枚作成 (アルバム 1 件)`);

  // -------------------------------------------------------------------------
  // 5) 経費 (4 つのステータスすべて)
  // -------------------------------------------------------------------------
  const receiptPaths: string[] = [];
  for (let i = 1; i <= 2; i += 1) {
    const path = `families/${FAMILY_ID}/receipts/${randomUUID()}.jpg`;
    await uploadSeedImage(`receipt-${i}.jpg`, path);
    receiptPaths.push(path);
  }

  const expenses = [
    {
      applicantUserId: USERS[2]!.uid,
      purchaseDate: jstDate(-1),
      merchant: 'スーパーやまだ',
      amount: 4580,
      category: 'food',
      description: '今週の食材',
      receiptStoragePath: receiptPaths[0]!,
      status: 'pending',
      adminComment: null,
      reviewedBy: null,
      reviewedAt: null,
    },
    {
      applicantUserId: USERS[1]!.uid,
      purchaseDate: jstDate(-3),
      merchant: 'ドラッグストア',
      amount: 2380,
      category: 'daily',
      description: '洗剤・ティッシュ',
      receiptStoragePath: receiptPaths[1]!,
      status: 'approved',
      adminComment: 'ありがとう',
      reviewedBy: USERS[0]!.uid,
      reviewedAt: jstDate(-2),
    },
    {
      applicantUserId: USERS[2]!.uid,
      purchaseDate: jstDate(-5),
      merchant: 'ゲームショップ',
      amount: 6800,
      category: 'clothing',
      description: '新しいゲーム',
      receiptStoragePath: null,
      status: 'rejected',
      adminComment: 'お小遣いから出してね',
      reviewedBy: USERS[0]!.uid,
      reviewedAt: jstDate(-4),
    },
    {
      applicantUserId: USERS[0]!.uid,
      purchaseDate: jstDate(0),
      merchant: '本屋さん',
      amount: 1650,
      category: 'education',
      description: '参考書 (まだ申請していない下書き)',
      receiptStoragePath: null,
      status: 'draft',
      adminComment: null,
      reviewedBy: null,
      reviewedAt: null,
    },
    {
      applicantUserId: USERS[1]!.uid,
      purchaseDate: jstDate(-8),
      merchant: '小児科',
      amount: 1200,
      category: 'medical',
      description: '予防接種',
      receiptStoragePath: null,
      status: 'approved',
      adminComment: null,
      reviewedBy: USERS[0]!.uid,
      reviewedAt: jstDate(-7),
    },
    {
      applicantUserId: USERS[0]!.uid,
      purchaseDate: jstDate(-10),
      merchant: 'JR東日本',
      amount: 3200,
      category: 'transport',
      description: '帰省の交通費',
      receiptStoragePath: null,
      status: 'approved',
      adminComment: null,
      reviewedBy: USERS[1]!.uid,
      reviewedAt: jstDate(-9),
    },
  ];

  for (const expense of expenses) {
    await db
      .collection('families')
      .doc(FAMILY_ID)
      .collection('expenses')
      .add({
        familyId: FAMILY_ID,
        ...expense,
        purchaseDate: Timestamp.fromDate(expense.purchaseDate),
        yearMonth: yearMonthOf(expense.purchaseDate),
        reviewedAt: expense.reviewedAt ? Timestamp.fromDate(expense.reviewedAt) : null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
  console.log(`  経費を ${expenses.length} 件作成 (draft/pending/approved/rejected)`);

  console.log('\n完了しました。以下でログインできます:\n');
  for (const user of USERS) {
    console.log(`  ${user.displayName.padEnd(8)} ${user.email} / ${user.password} (${user.role})`);
  }
  console.log(`\n  招待コード: ${INVITE_CODE}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('シードの投入に失敗しました:', error);
    process.exit(1);
  });
