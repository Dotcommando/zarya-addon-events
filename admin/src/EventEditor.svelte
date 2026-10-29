<script lang="ts">
  import type { IAddonAdminHost } from '@zarya/addon-contracts/addons';
  import { onMount, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

  import { event, type IEvent, type IRequest, page, record, requestRow } from './api';
  import { localInput, utcInstant } from './calendar';
  let { host, selected, date, onSaved, onRemoved, onSchedule }: {
    host: IAddonAdminHost;
    selected: IEvent | null;
    date: string;
    onSaved: (event: IEvent) => void;
    onRemoved: () => void;
    onSchedule: (id: string) => void;
  } = $props();
  let pageId = $state(untrack(() => selected?.pageId ?? host.pages[0]?.pageId ?? ''));
  let starts = $state(untrack(() => selected ? localInput(selected.startsAt, host.timeZone) : date + 'T12:00'));
  let duration = $state(untrack(() => selected ? (Date.parse(selected.endsAt) - Date.parse(selected.startsAt))
    / 60000 : 60));
  let capacity = $state(untrack(() => selected?.capacity ?? 8));
  let current = $state(untrack(() => selected));
  const initial = untrack(() => JSON.stringify([pageId, starts, duration, capacity]));
  const ru = $derived(host.language === 'ru');
  let busy = $state(false);
  let error = $state(false);
  let notice = $state('');
  let requests = $state<readonly IRequest[]>([]);
  let next = $state<string | null>(null);
  let requestsLoaded = $state(false);
  const keys = new SvelteMap<string, string>();
  const locked = $derived(selected !== null && (selected.status === 'Cancelled' || Date.parse(selected.startsAt)
    <= Date.now()));
  $effect(() => {
    host.setDirty(JSON.stringify([pageId, starts, duration, capacity]) !== initial);
  });
  async function run(action: () => Promise<void>): Promise<void> {
    busy = true;
    host.setBusy(true);
    error = false;
    notice = '';

    try {
      await action();
    } catch {
      error = true;
    } finally {
      busy = false;
      host.setBusy(false);
    }
  }
  async function loadRequests(append = false): Promise<void> {
    if (!selected) {
      return;
    }

    const query = new URLSearchParams({ limit: '100', ...(append && next ? { cursor: next } : {}) });
    const result = page(await host.request('/sessions/' + selected.sessionId + '/requests?' + query), requestRow);

    requests = append ? [...requests, ...result.items] : result.items;
    next = result.nextCursor;
    requestsLoaded = true;
  }
  async function save(): Promise<void> {
    const at = utcInstant(starts, host.timeZone);
    const input = {
      startsAt: at.toString(),
      endsAt: at.add({ seconds: duration * 60 }).toString(),
      timeZone: 'UTC',
      capacity,
    };
    const saved = record(await host.request(selected ? '/sessions/' + selected.sessionId + '/reschedule' : '/sessions',
      selected ? { ...input, expectedVersion: current?.version ?? selected.version } : { ...input, pageId }));
    const result = event({ ...saved, availablePlaces: saved.availablePlaces ?? capacity });

    host.setDirty(false);
    host.setBusy(false);
    onSaved(result);
  }
  async function remove(): Promise<void> {
    if (!selected) {
      return;
    }

    const result = record(await host.request('/sessions/' + selected.sessionId + '/remove', {
      expectedVersion: current?.version ?? selected.version,
    }));

    notice = result.outcome === 'Cancelled' ? (ru ? 'Событие отменено, заявки сохранены.'
      : 'Event cancelled; requests retained.')
      : (ru ? 'Событие удалено.' : 'Event removed.');
    host.setDirty(false);
    host.setBusy(false);
    onRemoved();
  }
  async function decide(item: IRequest, action: string): Promise<void> {
    const identity = item.requestId + ':' + item.version + ':' + action;
    const key = keys.get(identity) ?? crypto.randomUUID();

    keys.set(identity, key);
    await host.request('/participation-requests/' + item.requestId + '/' + action, {
      expectedRequestVersion: item.version,
    }, key);
    await loadRequests();

    if (selected) {
      current = event(await host.request('/sessions/' + selected.sessionId));
    }
    notice = ru ? 'Решение сохранено.' : 'Decision saved.';
  }
  onMount(() => {
    if (selected) {
      void run(() => loadRequests());
    }
  });
</script>
<div class="event-editor">
  <h1>{selected ? host.pages.find((p) => p.pageId === selected.pageId)?.title : (ru ? 'Новое событие'
    : 'New event')}</h1>
  {#if error}<p class="cms-error" role="alert">{ru
    ? 'Операция не выполнена. Обновите данные перед повтором; введённые значения сохранены.'
    : 'The operation failed. Refresh before retrying; your input is retained.'}</p>{/if}
  {#if notice}<p class="cms-success" role="status">{notice}</p>{/if}
  {#if selected?.status === 'Cancelled'}<p class="cms-callout">{ru ? 'Событие отменено.' : 'Event cancelled.'}</p>
  {:else if locked}<p class="cms-callout">{ru ? 'Начавшееся событие нельзя переносить.'
    : 'An event that has started cannot be rescheduled.'}</p>{/if}
  <form onsubmit={(e) => {
    e.preventDefault();
    void run(save);
  }}>
    <fieldset disabled={busy || locked || !selected && !host.enabled} class="_event-fields">
      <label class="_form-field">{ru ? 'Страница события' : 'Event page'}
        <select bind:value={pageId} disabled={selected !== null} required>
          {#each host.pages as item (item.pageId)}<option value={item.pageId}>{item.title}</option>{/each}
        </select>
      </label>
      <label class="_form-field">{ru ? 'Начало' : 'Starts'} · {host.timeZone}
        <input type="datetime-local" bind:value={starts} required />
      </label>
      <label class="_form-field">{ru ? 'Длительность, минут' : 'Duration, minutes'}
        <input type="number" min="1" step="1" bind:value={duration} required />
      </label>
      <label class="_form-field">{ru ? 'Количество мест' : 'Capacity'}
        <input type="number" min="1" step="1" bind:value={capacity} required />
      </label>
      <div class="_event-actions"><button class="cms-primary" disabled={!pageId}>{ru ? 'Сохранить событие'
        : 'Save event'}</button></div>
    </fieldset>
  </form>
  {#if selected}
    <div class="_event-actions">
      {#if selected.seriesId}<button class="cms-secondary" disabled={busy} onclick={() =>
        onSchedule(selected!.seriesId!)}>
        {ru ? 'Изменить расписание серии' : 'Edit recurring schedule'}</button>{/if}
      <button class="cms-danger" disabled={busy || !requestsLoaded || selected.status === 'Cancelled'} onclick={() => {
        void run(remove);
      }}>
        {requests.length ? (ru ? 'Отменить событие' : 'Cancel event') : (ru ? 'Удалить событие'
          : 'Delete event')}</button>
    </div>
    <h2>{ru ? 'Заявки участников' : 'Participation requests'}</h2>
    <p class="_event-summary">{ru ? 'Свободно' : 'Available'}:
      {current?.availablePlaces ?? selected.availablePlaces}/{current?.capacity ?? selected.capacity}
      · {ru ? 'Ожидают' : 'Pending'}: {current?.heldPlaces ?? selected.heldPlaces}
      · {ru ? 'Подтверждено' : 'Confirmed'}:
    {current?.confirmedPlaces ?? selected.confirmedPlaces}</p>
    {#each requests as item (item.requestId)}
      <article class="cms-card _event-request">
        <strong>{item.contact.name}</strong><span>{item.contact.email} · {item.contact.phone}</span>
        <span>{ru ? 'Мест' : 'Places'}: {item.places} · {item.state === 'Pending' ? (ru ? 'Ожидает' : 'Pending')
          : item.state === 'Confirmed' ? (ru ? 'Подтверждено' : 'Confirmed') : (ru ? 'Отклонено' : 'Declined')}</span>
        {#if item.state === 'Pending'}<div class="_event-actions">
          <button class="cms-primary" disabled={busy || selected.status === 'Cancelled'} onclick={() => {
            void run(() => decide(item, 'confirm'));
          }}>{ru ? 'Подтвердить' : 'Confirm'}</button>
          <button class="cms-secondary" disabled={busy} onclick={() => {
            void run(() => decide(item, 'decline'));
          }}>{ru ? 'Отклонить' : 'Decline'}</button>
        </div>{/if}
      </article>
    {/each}
    {#if requestsLoaded && !requests.length}<p>{ru ? 'Заявок пока нет.' : 'No requests yet.'}</p>{/if}
    {#if next}<button class="cms-secondary" disabled={busy} onclick={() => {
      void run(() => loadRequests(true));
    }}>{ru ? 'Ещё заявки' : 'More requests'}</button>{/if}
  {/if}
</div>
<style>
  .event-editor { max-width: 960px; }
  ._event-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding: 0;
    border: 0;
    min-width: 0;

  }
  ._event-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 16px; grid-column: 1 / -1; }
  ._event-request { display: grid; gap: 8px; margin: 0 0 8px; font-size: 14px; overflow-wrap: anywhere; }
  ._event-request ._event-actions { margin: 0; }
  ._event-summary { font-size: 13px; color: var(--cms-muted); }
  h1 { margin-top: 0; font-size: 24px; } h2 { font-size: 18px; }
  @media (min-width: 768px) {
    ._event-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 20px;

  }
  }
</style>
