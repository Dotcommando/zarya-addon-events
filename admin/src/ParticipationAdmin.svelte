<script lang="ts">
  import { Temporal } from '@js-temporal/polyfill';
  import type { IAddonAdminHost } from '@zarya/addon-contracts/addons';
  import { onMount, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

  import { event, type IEvent, type IRequest, page, record, requestRow, text } from './api';

  let { host }: { host: IAddonAdminHost } = $props();
  let events = $state<readonly IEvent[]>([]);
  let requests = $state<readonly IRequest[]>([]);
  let selected = $state<IEvent | null>(null);
  let nextEvents = $state<string | null>(null);
  let nextRequests = $state<string | null>(null);
  let busy = $state(false);
  let error = $state(false);
  let notice = $state('');
  let rangeStart = $state(Temporal.Now.plainDateISO('UTC').toString());
  let rangeEnd = $state(Temporal.Now.plainDateISO('UTC').add({ months: 2 }).toString());
  let timeZone = $state('UTC');
  let pageId = $state(untrack(() => host.pages[0]?.pageId ?? ''));
  let starts = $state(untrack(() => rangeStart + 'T12:00'));
  let duration = $state(60);
  let capacity = $state(8);
  let recurring = $state(true);
  let everyWeeks = $state(1);
  let weekdays = $state<number[]>([1]);
  let endsOn = $state('');
  let scope = $state('Occurrence');
  let seriesVersion = $state<string | null>(null);
  let selectedGeneration = 0;
  const decisionKeys = new SvelteMap<string, string>();
  const ru = $derived(host.language === 'ru');
  const weekdaysLabels = $derived(ru ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const failureMessage = $derived(ru
    ? 'Операция не выполнена. Проверьте поля; при конфликте обновите данные перед повтором.'
    : 'The operation failed. Check the fields; refresh data before retrying a conflict.');

  function stateLabel(state: string): string {
    return state === 'Pending' ? (ru ? 'Ожидает подтверждения' : 'Awaiting confirmation')
      : state === 'Confirmed' ? (ru ? 'Подтверждено' : 'Confirmed') : (ru ? 'Отклонено' : 'Declined');
  }

  function title(id: string): string {
    return host.pages.find((item) => item.pageId === id)?.title ?? id;
  }

  function date(value: string, zone: string): string {
    return new Intl.DateTimeFormat(host.language, {
      timeZone: zone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function instant(local: string): Temporal.Instant {
    return Temporal.PlainDateTime.from(local).toZonedDateTime(timeZone, { disambiguation: 'later' }).toInstant();
  }

  async function run(work: () => Promise<void>): Promise<void> {
    busy = true;
    error = false;
    notice = '';

    try {
      await work();
    } catch {
      error = true;
    } finally {
      busy = false;
    }
  }

  async function loadEvents(append = false): Promise<void> {
    const query = new URLSearchParams({
      rangeStart: Temporal.PlainDate.from(rangeStart).toZonedDateTime(timeZone).toInstant().toString(),
      rangeEnd: Temporal.PlainDate.from(rangeEnd).add({ days: 1 }).toZonedDateTime(timeZone).toInstant().toString(),
      limit: '100',
      ...(append && nextEvents ? { cursor: nextEvents } : {}),
    });
    const result = page(await host.request('/sessions?' + query), event);

    events = append ? [...events, ...result.items] : result.items;
    nextEvents = result.nextCursor;
  }

  async function loadRequests(id: string, append = false): Promise<void> {
    const captured = selectedGeneration;
    const query = new URLSearchParams({ limit: '100', ...(append && nextRequests ? { cursor: nextRequests } : {}) });
    const result = page(await host.request('/sessions/' + id + '/requests?' + query), requestRow);

    if (captured === selectedGeneration && selected?.sessionId === id) {
      requests = append ? [...requests, ...result.items] : result.items;
      nextRequests = result.nextCursor;
    }
  }

  async function select(item: IEvent): Promise<void> {
    selectedGeneration++;
    selected = item;
    requests = [];
    seriesVersion = null;
    pageId = item.pageId;
    timeZone = item.timeZone;
    starts = Temporal.Instant.from(item.startsAt).toZonedDateTimeISO(item.timeZone)
      .toPlainDateTime().toString({ smallestUnit: 'minute' });
    duration = Math.round((new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60000);
    capacity = item.capacity;
    scope = 'Occurrence';
    await loadRequests(item.sessionId);

    if (item.seriesId) {
      const result = record(await host.request('/session-series/' + item.seriesId));
      const rules = result.rules;

      seriesVersion = text(result.version);

      if (Array.isArray(rules) && rules.length) {
        const pattern = record(record(rules.at(-1)).pattern);

        if (typeof pattern.everyWeeks === 'number') {
          everyWeeks = pattern.everyWeeks;
        }
        if (Array.isArray(pattern.weekdays)) {
          weekdays = pattern.weekdays.filter((value: unknown): value is number => typeof value === 'number');
        }
        endsOn = typeof pattern.endsOn === 'string' ? pattern.endsOn : '';
      }
    }
  }

  async function refreshSelected(): Promise<void> {
    await loadEvents();

    if (selected) {
      await select(event(await host.request('/sessions/' + selected.sessionId)));
    }
  }

  function recurrence(): Record<string, unknown> {
    const local = Temporal.PlainDateTime.from(starts);

    return {
      startsOn: local.toPlainDate().toString(),
      endsOn: endsOn || null,
      everyWeeks,
      weekdays,
      localTime: local.toPlainTime().toString({ smallestUnit: 'minute' }),
      timeZone,
      durationMinutes: duration,
    };
  }

  function clearSelection(): void {
    selectedGeneration++;
    selected = null;
    requests = [];
    seriesVersion = null;
  }

  async function save(): Promise<void> {
    const at = instant(starts);

    if (selected) {
      if (selected.seriesId && scope !== 'Occurrence') {
        await host.request('/session-series/' + selected.seriesId + '/schedule', {
          expectedVersion: seriesVersion,
          sessionId: scope === 'Series' ? null : selected.sessionId,
          scope,
          pattern: recurrence(),
          capacity,
        });
      } else {
        await host.request('/sessions/' + selected.sessionId + '/reschedule', {
          expectedVersion: selected.version,
          startsAt: at.toString(),
          endsAt: at.add({ seconds: duration * 60 }).toString(),
          timeZone,
          capacity,
        });
      }
      await refreshSelected();
    } else if (recurring) {
      await host.request('/session-series', { pageId, pattern: recurrence(), capacity });
      await loadEvents();
    } else {
      await host.request('/sessions', {
        pageId, startsAt: at.toString(), endsAt: at.add({ seconds: duration * 60 }).toString(), timeZone, capacity,
      });
      await loadEvents();
    }
    notice = ru ? 'Сохранено' : 'Saved';
  }

  async function remove(): Promise<void> {
    if (!selected) {
      return;
    }

    const result = record(await host.request('/sessions/' + selected.sessionId + '/remove', {
      expectedVersion: selected.version,
    }));

    clearSelection();
    await loadEvents();
    notice = result.outcome === 'Cancelled'
      ? (ru ? 'Событие отменено. Заявки сохранены.' : 'Event cancelled. Requests retained.')
      : (ru ? 'Событие удалено.' : 'Event removed.');
  }

  async function decide(item: IRequest, action: string): Promise<void> {
    const identity = item.requestId + ':' + item.version + ':' + action;
    const key = decisionKeys.get(identity) ?? crypto.randomUUID();

    decisionKeys.set(identity, key);
    await host.request('/participation-requests/' + item.requestId + '/' + action, {
      expectedRequestVersion: item.version,
    }, key);
    await refreshSelected();
  }

  onMount(() => {
    void run(() => loadEvents());
  });
</script>

<section class="participation-admin" aria-label={ru ? 'События и записи' : 'Events and bookings'}>
  <h2>{ru ? 'События и записи' : 'Events and bookings'}</h2>
  <form class="_calendar-filter" onsubmit={(e) => {
    e.preventDefault();
    clearSelection();
    void run(() => loadEvents());
  }}>
    <label>{ru ? 'С даты' : 'From'}<input type="date" bind:value={rangeStart} required disabled={busy} /></label>
    <label>{ru ? 'По дату' : 'Through'}<input type="date" bind:value={rangeEnd} required disabled={busy} /></label>
    <label>{ru ? 'Часовой пояс IANA' : 'IANA time zone'}<input bind:value={timeZone} required disabled={busy} /></label>
    <button disabled={busy}>{ru ? 'Показать' : 'Show'}</button>
  </form>
  {#if error}<p role="alert">{failureMessage}</p>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if busy}<p role="status">{ru ? 'Загрузка…' : 'Loading…'}</p>{/if}
  <div class="_events-list" aria-label={ru ? 'Список событий' : 'Event list'}>
    {#each events as item (item.sessionId)}
      <button class="_event-row" class:_event-row__selected={selected?.sessionId === item.sessionId}
        aria-pressed={selected?.sessionId === item.sessionId} disabled={busy} onclick={() => {
          void run(() => select(item));
        }}>
        <strong>{title(item.pageId)}</strong>
        <span>{date(item.startsAt, item.timeZone)} · {item.timeZone}</span>
        <span>{item.status === 'Cancelled' ? (ru ? 'Отменено' : 'Cancelled') : (ru ? 'Запланировано' : 'Scheduled')}
          · {ru ? 'Свободно' : 'Available'}: {item.availablePlaces}/{item.capacity}
          · {ru ? 'Ожидают' : 'Held'}: {item.heldPlaces}
          · {ru ? 'Подтверждено' : 'Confirmed'}: {item.confirmedPlaces}</span>
      </button>
    {/each}
    {#if !busy && !events.length}<p>{ru ? 'В этом периоде событий нет.' : 'No events in this period.'}</p>{/if}
    {#if nextEvents}<button disabled={busy} onclick={() => {
      void run(() => loadEvents(true));
    }}>{ru ? 'Ещё события' : 'More events'}</button>{/if}
  </div>

  <h3>{selected ? (ru ? 'Изменить событие' : 'Edit event') : (ru ? 'Добавить событие' : 'Add event')}</h3>
  {#if selected || host.enabled}
    <form class="_event-form" onsubmit={(e) => {
      e.preventDefault();
      void run(save);
    }}>
      <label>{ru ? 'Страница' : 'Page'}<select bind:value={pageId} disabled={busy || selected !== null} required>
        {#each host.pages as item (item.pageId)}<option value={item.pageId}>{item.title}</option>{/each}
      </select></label>
      <label>{ru ? 'Начало (в указанном часовом поясе)' : 'Start (in the specified time zone)'}
        <input type="datetime-local" bind:value={starts} required disabled={busy} /></label>
      <label>{ru ? 'Часовой пояс события IANA' : 'Event IANA time zone'}
        <input bind:value={timeZone} required disabled={busy} /></label>
      <label>{ru ? 'Длительность, минут' : 'Duration, minutes'}
        <input type="number" min="1" step="1" bind:value={duration} required disabled={busy} /></label>
      <label>{ru ? 'Количество мест' : 'Capacity'}
        <input type="number" min="1" step="1" bind:value={capacity} required disabled={busy} /></label>
      {#if !selected}
        <label><input type="checkbox" bind:checked={recurring} disabled={busy} />
          {ru ? 'Повторять' : 'Repeat'}</label>
      {/if}
      {#if selected?.seriesId}
        <label>{ru ? 'Применить к' : 'Apply to'}<select bind:value={scope} disabled={busy}>
          <option value="Occurrence">{ru ? 'Этой встрече' : 'This occurrence'}</option>
          <option value="Following">{ru ? 'Этой и следующим' : 'This and following'}</option>
          <option value="Series">{ru ? 'Всей серии (будущие встречи)' : 'Entire series (future occurrences)'}</option>
        </select></label>
      {/if}
      {#if !selected && recurring || selected?.seriesId && scope !== 'Occurrence'}
        <label>{ru ? 'Каждые N недель' : 'Every N weeks'}
          <input type="number" min="1" step="1" bind:value={everyWeeks} required disabled={busy} /></label>
        <fieldset disabled={busy}><legend>{ru ? 'Дни недели' : 'Weekdays'}</legend>
          {#each weekdaysLabels as label, index (index)}
            <label><input type="checkbox" bind:group={weekdays} value={index + 1} />{label}</label>
          {/each}
        </fieldset>
        <label>{ru ? 'Последний день серии (необязательно)' : 'Last series date (optional)'}
          <input type="date" bind:value={endsOn} disabled={busy} /></label>
      {/if}
      <div class="_event-actions">
        <button disabled={busy || !pageId || !selected && !host.enabled}>
          {ru ? 'Сохранить событие' : 'Save event'}</button>
        {#if selected}
          <button type="button" disabled={busy} onclick={() => {
            void run(remove);
          }}>{ru ? 'Удалить / отменить событие' : 'Remove / cancel event'}</button>
          <button type="button" disabled={busy} onclick={clearSelection}>{ru ? 'Новое событие' : 'New event'}</button>
        {/if}
      </div>
    </form>
  {/if}
  {#if selected}
    <h3>{ru ? 'Заявки на событие' : 'Event requests'}</h3>
    {#each requests as item (item.requestId)}
      <article class="_request-row">
        <strong>{item.contact.name}</strong><span>{item.contact.email} · {item.contact.phone}</span>
        <span>{ru ? 'Участников' : 'Participants'}: {item.places} · {stateLabel(item.state)}</span>
        {#if item.state === 'Pending'}
          <div class="_event-actions">
            <button disabled={busy || selected.status === 'Cancelled'} onclick={() => {
              void run(() => decide(item, 'confirm'));
            }}>{ru ? 'Подтвердить' : 'Confirm'}</button>
            <button disabled={busy} onclick={() => {
              void run(() => decide(item, 'decline'));
            }}>{ru ? 'Отклонить' : 'Decline'}</button>
          </div>
        {/if}
      </article>
    {/each}
    {#if !requests.length && !busy}<p>{ru ? 'Заявок пока нет.' : 'No requests yet.'}</p>{/if}
    {#if nextRequests}<button disabled={busy} onclick={() => {
      if (selected) {
        void run(() => loadRequests(selected!.sessionId, true));
      }
    }}>{ru ? 'Ещё заявки' : 'More requests'}</button>{/if}
  {/if}
</section>

<style>
  .participation-admin { display: grid; gap: 16px; padding: 16px 0; }
  .participation-admin h2, .participation-admin h3 { margin: 0; }
  ._calendar-filter, ._event-form { display: grid; gap: 12px; }
  label { display: grid; gap: 6px; min-width: 0; }
  input, select { min-width: 0; max-width: 100%; padding: 8px; font: inherit; }
  input[type="checkbox"] { width: 20px; height: 20px; }
  button { padding: 10px 12px; font: inherit; cursor: pointer; }
  button:disabled { cursor: default; }
  fieldset, ._event-actions { display: flex; flex-wrap: wrap; gap: 12px; }
  ._events-list { display: grid; gap: 8px; }
  ._event-row, ._request-row {
    display: grid; gap: 8px; padding: 12px; border: 2px solid #cbd5e1; border-radius: 8px;
    background: #f8fafc; text-align: start; overflow-wrap: anywhere;
  }
  ._event-row:hover { background: #e2e8f0; }
  ._event-row__selected { border-color: #2563eb; }
  :focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
  [role="alert"] { color: #b91c1c; }
  @media (min-width: 768px) { ._calendar-filter, ._event-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
