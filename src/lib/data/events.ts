import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { eventDoc, eventsCol } from '@/lib/data/paths';
import { bool, str, strOrNull, tsToIso } from '@/lib/firebase/converters';
import type { CalendarEvent } from '@/lib/types';
import { notFound } from '@/lib/errors';
import {
  endOfJstDayUtc,
  endOfJstMonthUtc,
  jstInputToUtc,
  startOfJstDayUtc,
  startOfJstMonthUtc,
} from '@/lib/datetime';
import type { EventFormInput } from '@/lib/validation/schemas';

/**
 * カレンダーの予定。
 *
 * クエリ設計のポイント:
 *   Firestore は「2 つのフィールドに範囲条件」を同時に付けられない。
 *   本来なら `startAt < 月末 かつ endAt >= 月初` で重なりを判定したいが、
 *   それはできないので
 *     1. startAt の範囲だけで少し広めに取得 (月初の 31 日前から)
 *     2. アプリ側で重なりを判定して絞り込む
 *   という方法を取っている。家族の予定は月に数十件なので追加の read は誤差。
 *   もし予定が数千件になるなら、日付ごとの非正規化 (occurrences) を検討する。
 */

/** 月をまたぐ長期予定を拾うための余裕 */
const LOOKBACK_DAYS = 31;

function toEvent(id: string, familyId: string, data: FirebaseFirestore.DocumentData): CalendarEvent {
  return {
    id,
    familyId,
    title: str(data.title, '(タイトルなし)'),
    description: strOrNull(data.description),
    startAt: tsToIso(data.startAt),
    endAt: tsToIso(data.endAt),
    allDay: bool(data.allDay),
    location: strOrNull(data.location),
    assignedUserId: strOrNull(data.assignedUserId),
    createdBy: str(data.createdBy),
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

/** フォーム入力を保存用の値へ変換する (JST 入力 -> UTC 保存) */
export function eventInputToDocument(input: EventFormInput) {
  const allDay = input.allDay ?? false;
  let startAt: Date;
  let endAt: Date;

  if (allDay) {
    const startDate = input.startDate!;
    const endDate = input.endDate || startDate;
    startAt = startOfJstDayUtc(`${startDate}T00:00:00Z`);
    // 終日予定の終端は「その日の 24:00」= 翌日 0:00 (排他)
    endAt = endOfJstDayUtc(`${endDate}T00:00:00Z`);
  } else {
    startAt = jstInputToUtc(input.startAt!);
    endAt = jstInputToUtc(input.endAt!);
  }

  return {
    title: input.title,
    description: input.description ? input.description : null,
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    allDay,
    location: input.location ? input.location : null,
    assignedUserId: input.assignedUserId ? input.assignedUserId : null,
  };
}

/** 指定範囲に「重なる」予定を返す */
export async function listEventsInRange(params: {
  familyId: string;
  fromUtc: Date;
  toUtc: Date;
}): Promise<CalendarEvent[]> {
  const lookbackFrom = new Date(params.fromUtc.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const snap = await eventsCol(params.familyId)
    .where('startAt', '>=', Timestamp.fromDate(lookbackFrom))
    .where('startAt', '<', Timestamp.fromDate(params.toUtc))
    .orderBy('startAt', 'asc')
    .get();

  return snap.docs
    .map((doc) => toEvent(doc.id, params.familyId, doc.data()))
    // 期間が重なるものだけ残す (start < to かつ end > from)
    .filter((event) => new Date(event.endAt) > params.fromUtc);
}

export async function listEventsForMonth(params: {
  familyId: string;
  monthKey: string;
}): Promise<CalendarEvent[]> {
  return listEventsInRange({
    familyId: params.familyId,
    fromUtc: startOfJstMonthUtc(params.monthKey),
    toUtc: endOfJstMonthUtc(params.monthKey),
  });
}

/** 今日 (JST) の予定 */
export async function listTodayEvents(familyId: string): Promise<CalendarEvent[]> {
  const now = new Date();
  return listEventsInRange({
    familyId,
    fromUtc: startOfJstDayUtc(now),
    toUtc: endOfJstDayUtc(now),
  });
}

/** これからの予定 (ホーム画面用)。今日以降を開始日時順に。 */
export async function listUpcomingEvents(params: {
  familyId: string;
  limit?: number;
}): Promise<CalendarEvent[]> {
  const snap = await eventsCol(params.familyId)
    .where('startAt', '>=', Timestamp.fromDate(startOfJstDayUtc(new Date())))
    .orderBy('startAt', 'asc')
    .limit(params.limit ?? 5)
    .get();
  return snap.docs.map((doc) => toEvent(doc.id, params.familyId, doc.data()));
}

export async function getEvent(params: {
  familyId: string;
  eventId: string;
}): Promise<CalendarEvent | null> {
  const snap = await eventDoc(params.familyId, params.eventId).get();
  if (!snap.exists) return null;
  return toEvent(snap.id, params.familyId, snap.data() ?? {});
}

export async function createEvent(params: {
  familyId: string;
  userId: string;
  input: EventFormInput;
}): Promise<string> {
  const now = FieldValue.serverTimestamp();
  const ref = await eventsCol(params.familyId).add({
    ...eventInputToDocument(params.input),
    familyId: params.familyId,
    createdBy: params.userId,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateEvent(params: {
  familyId: string;
  eventId: string;
  input: EventFormInput;
}): Promise<void> {
  const ref = eventDoc(params.familyId, params.eventId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('予定が見つかりません。');
  await ref.update({
    ...eventInputToDocument(params.input),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function deleteEvent(params: { familyId: string; eventId: string }): Promise<void> {
  await eventDoc(params.familyId, params.eventId).delete();
}

// 日付ごとのグループ化は純粋関数なので lib/calendar/grouping.ts に置き、
// ここから再エクスポートしている (単体テストしやすくするため)。
export { groupEventsByDay } from '@/lib/calendar/grouping';
