'use client';

import { useActionState, useState } from 'react';
import { createEventAction, updateEventAction } from '@/features/calendar/actions';
import { emptyFormState } from '@/lib/form-state';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, FormError, Select, TextArea, TextInput } from '@/components/ui/field';
import type { CalendarEvent, FamilyMember } from '@/lib/types';
import { toDateInputValue, toDateTimeInputValue } from '@/lib/datetime';

/**
 * 予定の作成・編集フォーム。
 *
 * 日時の入力は「JST の壁掛け時刻」として扱い、サーバー側で UTC に変換する
 * (src/lib/datetime/jstInputToUtc)。端末のタイムゾーン設定に影響されない。
 */
export function EventForm({
  familyId,
  members,
  event,
  defaultDate,
}: {
  familyId: string;
  members: FamilyMember[];
  event?: CalendarEvent;
  defaultDate?: string;
}) {
  const isEdit = Boolean(event);
  const [state, action, pending] = useActionState(
    isEdit ? updateEventAction : createEventAction,
    emptyFormState,
  );
  const [allDay, setAllDay] = useState(event?.allDay ?? false);

  const baseDate = defaultDate ?? (event ? toDateInputValue(event.startAt) : todayInput());
  const defaultStartAt = event ? toDateTimeInputValue(event.startAt) : `${baseDate}T09:00`;
  const defaultEndAt = event ? toDateTimeInputValue(event.endAt) : `${baseDate}T10:00`;
  const defaultEndDate = event
    ? toDateInputValue(new Date(new Date(event.endAt).getTime() - 1000))
    : baseDate;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="familyId" value={familyId} />
      {event ? <input type="hidden" name="eventId" value={event.id} /> : null}

      <FormError message={state.error} />

      <Field label="タイトル" htmlFor="title" required>
        <TextInput
          id="title"
          name="title"
          required
          maxLength={100}
          defaultValue={event?.title}
          placeholder="例: 保育園の運動会"
        />
      </Field>

      <label className="flex min-h-[44px] items-center gap-3 rounded-xl border border-line bg-surface px-3">
        <input
          type="checkbox"
          name="allDay"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="h-5 w-5 accent-[#e07a5f]"
        />
        <span className="text-[15px] text-ink">終日</span>
      </label>

      {allDay ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="開始日" htmlFor="startDate" required>
            <TextInput id="startDate" name="startDate" type="date" required defaultValue={baseDate} />
          </Field>
          <Field label="終了日" htmlFor="endDate">
            <TextInput id="endDate" name="endDate" type="date" defaultValue={defaultEndDate} />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="開始日時" htmlFor="startAt" required>
            <TextInput
              id="startAt"
              name="startAt"
              type="datetime-local"
              required
              defaultValue={defaultStartAt}
            />
          </Field>
          <Field label="終了日時" htmlFor="endAt" required>
            <TextInput
              id="endAt"
              name="endAt"
              type="datetime-local"
              required
              defaultValue={defaultEndAt}
            />
          </Field>
        </div>
      )}

      <Field label="誰の予定" htmlFor="assignedUserId" hint="家族全体の予定なら「みんな」のまま">
        <Select id="assignedUserId" name="assignedUserId" defaultValue={event?.assignedUserId ?? ''}>
          <option value="">みんな</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="場所" htmlFor="location">
        <TextInput
          id="location"
          name="location"
          maxLength={200}
          defaultValue={event?.location ?? ''}
          placeholder="例: 市民体育館"
        />
      </Field>

      <Field label="メモ" htmlFor="description">
        <TextArea
          id="description"
          name="description"
          maxLength={2000}
          defaultValue={event?.description ?? ''}
          placeholder="持ち物、集合時間など"
        />
      </Field>

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? '保存中…' : isEdit ? '変更を保存' : '予定を作成'}
        </Button>
        <ButtonLink
          href={event ? `/calendar/${event.id}` : '/calendar'}
          variant="ghost"
          size="lg"
        >
          キャンセル
        </ButtonLink>
      </div>
    </form>
  );
}

function todayInput(): string {
  return toDateInputValue(new Date());
}
