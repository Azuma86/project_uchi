'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireFamilyAccess } from '@/lib/auth/session';
import { createEvent, deleteEvent, getEvent, updateEvent } from '@/lib/data/events';
import { createEventSchema, deleteEventSchema, updateEventSchema } from '@/lib/validation/schemas';
import { checkbox, field, toFormState, type FormState } from '@/lib/actions';
import { canDeleteEvent, canEditEvent } from '@/lib/permissions';
import { forbidden, notFound } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

/**
 * カレンダーの Server Action。
 *
 * 共有カレンダーなので作成・編集は家族全員が可能。
 * 削除だけは「作成者本人か管理者」に限定している (誤削除を防ぐため)。
 * 同じ判定を firebase/firestore.rules にも書いてある。
 */

function readEventForm(formData: FormData) {
  return {
    title: field(formData, 'title'),
    description: field(formData, 'description'),
    allDay: checkbox(formData, 'allDay'),
    startAt: field(formData, 'startAt') || undefined,
    endAt: field(formData, 'endAt') || undefined,
    startDate: field(formData, 'startDate') || undefined,
    endDate: field(formData, 'endDate') || undefined,
    location: field(formData, 'location'),
    assignedUserId: field(formData, 'assignedUserId'),
  };
}

export async function createEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let redirectTo = '/calendar';
  try {
    const parsed = createEventSchema.safeParse({
      familyId: field(formData, 'familyId'),
      event: readEventForm(formData),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    const session = await requireFamilyAccess(parsed.data.familyId);
    if (!canEditEvent(session.role)) throw forbidden('予定を作成する権限がありません。');

    const eventId = await createEvent({
      familyId: session.familyId,
      userId: session.userId,
      input: parsed.data.event,
    });

    logger.info('予定を作成しました', {
      userId: session.userId,
      familyId: session.familyId,
      action: 'event.create',
      eventId,
    });
    redirectTo = `/calendar/${eventId}`;
  } catch (error) {
    return toFormState(error, { action: 'event.create' });
  }

  revalidatePath('/calendar');
  revalidatePath('/home');
  redirect(redirectTo);
}

export async function updateEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let eventId = '';
  try {
    const parsed = updateEventSchema.safeParse({
      familyId: field(formData, 'familyId'),
      eventId: field(formData, 'eventId'),
      event: readEventForm(formData),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    const session = await requireFamilyAccess(parsed.data.familyId);
    if (!canEditEvent(session.role)) throw forbidden('予定を編集する権限がありません。');

    eventId = parsed.data.eventId;
    await updateEvent({
      familyId: session.familyId,
      eventId,
      input: parsed.data.event,
    });
  } catch (error) {
    return toFormState(error, { action: 'event.update' });
  }

  revalidatePath('/calendar');
  revalidatePath('/home');
  redirect(`/calendar/${eventId}`);
}

export async function deleteEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const parsed = deleteEventSchema.safeParse({
      familyId: field(formData, 'familyId'),
      eventId: field(formData, 'eventId'),
    });
    if (!parsed.success) return { error: '入力内容を確認してください。' };

    const session = await requireFamilyAccess(parsed.data.familyId);
    const event = await getEvent({ familyId: session.familyId, eventId: parsed.data.eventId });
    if (!event) throw notFound('予定が見つかりません。');

    if (!canDeleteEvent({ role: session.role, userId: session.userId, event })) {
      throw forbidden('この予定は作成者または管理者のみ削除できます。');
    }

    await deleteEvent({ familyId: session.familyId, eventId: parsed.data.eventId });
    logger.info('予定を削除しました', {
      userId: session.userId,
      familyId: session.familyId,
      action: 'event.delete',
      eventId: parsed.data.eventId,
    });
  } catch (error) {
    return toFormState(error, { action: 'event.delete' });
  }

  revalidatePath('/calendar');
  revalidatePath('/home');
  redirect('/calendar');
}
