<script lang="ts">
  import { Temporal } from '@js-temporal/polyfill';
  import type { IAddonAdminHost } from '@zarya/addon-contracts/addons';
  import { tick, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

  import { allEvents, event, type IEvent, type ISeries, record, series } from './api';
  import { calendarDays, displayPattern, EventsView, localDate, parseLocation } from './calendar';
  import CalendarMonth from './CalendarMonth.svelte';
  import EventEditor from './EventEditor.svelte';
  import EventsSettings from './EventsSettings.svelte';
  import ScheduleEditor from './ScheduleEditor.svelte';
  let { host }: { host: IAddonAdminHost } = $props();
  const ru = $derived(host.language === 'ru');
  const today = $derived(Temporal.Now.plainDateISO(host.timeZone).toString());
  const location = $derived(parseLocation(host.location, today));
  const scheduleView = $derived([EventsView.Schedule, EventsView.Series, EventsView.NewSeries].includes(location.view));
  const dayView = $derived([EventsView.Day, EventsView.Event, EventsView.NewEvent].includes(location.view));
  let events = $state<readonly IEvent[]>([]);
  let schedules = $state<readonly ISeries[]>([]);
  let selectedEvent = $state<IEvent | null>(null);
  let selectedSeries = $state<ISeries | null>(null);
  let occurrences = $state<readonly IEvent[]>([]);
  let mutating = $state(false);
  const editorHost: IAddonAdminHost = $derived({
    ...host,
    setBusy: (value: boolean) => {
      mutating = value;
      host.setBusy(value);
    },
  });
  let loading = $state(false);
  let error = $state(false);
  let revision = $state(0);
  let generation = 0;
  let scrollNode: HTMLDivElement | undefined;
  let previousQuery = '';
  const scrollPositions = new SvelteMap<string, number>();
  function title(pageId: string): string {
    return host.pages.find((item) => item.pageId === pageId)?.title ?? pageId;
  }
  function go(view: EventsView, extra: { month?: string;
    date?: string;
    id?: string } = {}): void {
    host.navigate('?' + new URLSearchParams({
      view,
      month: extra.month ?? location.month,
      date: extra.date ?? location.date,
      ...(extra.id ? { id: extra.id } : {}),
    }));
  }
  function dateLabel(date: string): string {
    return Temporal.PlainDate.from(date).toLocaleString(host.language, { dateStyle: 'full' });
  }
  function timeLabel(value: string): string {
    return new Intl.DateTimeFormat(host.language, {
      timeZone: host.timeZone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }
  function monthLabel(): string {
    return Temporal.PlainYearMonth.from(location.month).toPlainDate({ day: 1 })
      .toLocaleString(host.language, { month: 'long', year: 'numeric' });
  }
  function scheduleLabel(item: ISeries): string {
    const pattern = displayPattern(item.rules.at(-1)!.pattern, host.timeZone);
    const days = ru ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return pattern.weekdays.map((day) => days[day - 1]).join(', ') + ' · ' + pattern.localTime + ' · ' + host.timeZone;
  }
  async function load(): Promise<void> {
    const captured = ++generation;

    if (scrollNode) {
      scrollPositions.set(previousQuery, scrollNode.scrollTop);
    }
    previousQuery = host.location;
    const route = location;
    const zone = host.timeZone;

    loading = true;
    error = false;

    try {
      if ([EventsView.Schedule, EventsView.Series, EventsView.NewSeries].includes(route.view)) {
        const response = record(await host.request('/session-series'));

        if (!Array.isArray(response.items)) {
          throw new Error('Invalid schedules');
        }

        const items = response.items.map(series);
        const selected = route.view === EventsView.Series ? series(await host.request('/session-series/'
    + route.id)) : null;
        const now = Temporal.Now.instant();
        const rows = selected ? await allEvents(host, now.toString(), now.add({ hours: 24 * 366 }).toString(),
          selected.pageId) : [];

        if (captured === generation) {
          schedules = items;
          selectedSeries = selected;
          occurrences = rows.filter((item) => item.seriesId === selected?.seriesId);
        }
      } else if (route.view !== EventsView.Settings) {
        const cells = calendarDays(route.month);
        const first = route.view === EventsView.Calendar ? cells[0]! : route.date;
        const end = route.view === EventsView.Calendar ? Temporal.PlainDate.from(cells.at(-1)!).add({ days: 1 })
          : Temporal.PlainDate.from(first).add({ days: 1 });
        const rows = await allEvents(host, Temporal.PlainDate.from(first).toZonedDateTime(zone).toInstant().toString(),
          end.toZonedDateTime(zone).toInstant().toString());
        const selected = route.view === EventsView.Event ? event(await host.request('/sessions/' + route.id)) : null;

        if (captured === generation) {
          events = rows;
          selectedEvent = selected;
        }
      }
    } catch {
      if (captured === generation) {
        error = true;
      }
    } finally {
      if (captured === generation) {
        loading = false;
        await tick();

        if (scrollNode && captured === generation) {
          scrollNode.scrollTop = scrollPositions.get(host.location) ?? 0;
        }
      }
    }
  }
  const loadKey = $derived(host.location + '|' + host.timeZone + '|' + revision);
  $effect(() => {
    const key = loadKey;

    untrack(() => {
      void key;
      void load();
    });
  });
</script>
<section class="events-admin" aria-label={ru ? 'События' : 'Events'}>
  <nav class="cms-tabs" aria-label={ru ? 'Разделы событий' : 'Events sections'}>
    <button class="cms-tab" disabled={mutating}
      aria-current={!scheduleView && location.view !== EventsView.Settings ? 'page' : undefined}
      onclick={() => go(EventsView.Calendar)}>{ru ? 'Календарь' : 'Calendar'}</button>
    <button class="cms-tab" disabled={mutating}
      aria-current={scheduleView ? 'page' : undefined}
      onclick={() => go(EventsView.Schedule)}>{ru ? 'Расписание' : 'Schedule'}</button>
    <button class="cms-tab" disabled={mutating}
      aria-current={location.view === EventsView.Settings ? 'page' : undefined}
      onclick={() => go(EventsView.Settings)}>{ru ? 'Настройки' : 'Settings'}</button>
  </nav>
  <div use:host.scrollShadow bind:this={scrollNode} class="_events-body" aria-busy={loading}>
    {#if ![EventsView.Settings, EventsView.Calendar, EventsView.Schedule].includes(location.view)}
      <nav class="events-breadcrumbs" aria-label={ru ? 'Хлебные крошки событий' : 'Events breadcrumbs'}>
        <button disabled={mutating}
          onclick={() => go(scheduleView ? EventsView.Schedule : EventsView.Calendar)}>{scheduleView ? (ru
            ? 'Расписание' : 'Schedule') : (ru ? 'Календарь' : 'Calendar')}</button>
        {#if !scheduleView}<span aria-hidden="true">/</span><button onclick={() =>
          go(EventsView.Calendar)}>{monthLabel()}</button>{/if}
        {#if dayView}<span aria-hidden="true">/</span><button onclick={() =>
          go(EventsView.Day)}>{dateLabel(location.date)}</button>{/if}
        {#if location.view === EventsView.Event && selectedEvent}<span aria-hidden="true">/</span><span
    aria-current="page">{title(selectedEvent.pageId)}</span>{/if}
      </nav>
    {/if}
    {#if loading}<p class="_events-status" role="status">{ru ? 'Загрузка…' : 'Loading…'}</p>{/if}
    {#if error}<div class="cms-callout"><p class="cms-error" role="alert">{ru
      ? 'Не удалось загрузить события. Повторите загрузку.' : 'Could not load events. Try again.'}</p>
      <button class="cms-secondary" onclick={() => {
        revision++;
      }}>{ru ? 'Обновить' : 'Refresh'}</button></div>
    {:else if !loading}
      {#if location.view === EventsView.Settings}
        <EventsSettings host={editorHost} />
      {:else if location.view === EventsView.Calendar}
        <CalendarMonth month={location.month} {today} language={host.language} timeZone={host.timeZone} {events}
          titles={host.pages} busy={loading} onMonth={(month) => go(EventsView.Calendar, { month })}
          onDay={(date) => go(EventsView.Day, { date })} onEvent={(id, date) => go(EventsView.Event, { id, date })} />
      {:else if location.view === EventsView.Day}
        <div class="_events-heading"><h1>{dateLabel(location.date)}</h1>
          {#if host.enabled}<button class="cms-primary" onclick={() => go(EventsView.NewEvent)}>{ru
            ? 'Добавить событие' : 'Add event'}</button>{/if}
        </div>
        <button class="_events-back" disabled={mutating}
          onclick={() => go(EventsView.Calendar)}>← {ru ? 'К месяцу'
            : 'Back to month'}</button>
        <p class="_events-zone">{host.timeZone}</p>
        <div class="_events-list">
          {#each events.filter((item) => localDate(item.startsAt, host.timeZone) === location.date) as item
    (item.sessionId)}
            <button class="cms-row _events-row" onclick={() => go(EventsView.Event, { id: item.sessionId })}>
              <time>{timeLabel(item.startsAt)}–{timeLabel(item.endsAt)}</time><strong>{title(item.pageId)}</strong>
              <span>{item.status === 'Cancelled' ? (ru ? 'Отменено' : 'Cancelled') : (ru ? 'Запланировано'
                : 'Scheduled')}
                · {ru ? 'Свободно' : 'Available'}: {item.availablePlaces}/{item.capacity}
                · {ru ? 'Ожидают' : 'Pending'}: {item.heldPlaces} · {ru ? 'Подтверждено' : 'Confirmed'}:
    {item.confirmedPlaces}</span>
            </button>
          {/each}
          {#if !events.filter((item) => localDate(item.startsAt, host.timeZone) === location.date).length}<p>{ru
            ? 'В этот день событий нет.' : 'No events on this day.'}</p>{/if}
        </div>
      {:else if location.view === EventsView.Event || location.view === EventsView.NewEvent}
        <button class="_events-back" disabled={mutating}
          onclick={() => go(EventsView.Day)}>← {ru ? 'К событиям' : 'Back to events'}
    {dateLabel(location.date)}</button>
        {#key (selectedEvent?.version ?? 'new') + host.timeZone + location.view}
          <EventEditor host={editorHost} selected={location.view === EventsView.Event ? selectedEvent : null}
            date={location.date}
            onSaved={(item) => {
              go(EventsView.Event, { id: item.sessionId, date: localDate(item.startsAt, host.timeZone) });
              revision++;
            }}
            onRemoved={() => go(EventsView.Day)} onSchedule={(id) => go(EventsView.Series, { id })} />
        {/key}
      {:else if location.view === EventsView.Schedule}
        <div class="_events-heading"><h1>{ru ? 'Периодические события' : 'Recurring events'}</h1>
          {#if host.enabled}<button class="cms-primary"
            onclick={() => go(EventsView.NewSeries, { date: today })}>
            {ru ? 'Добавить расписание' : 'Add schedule'}</button>{/if}
        </div>
        <div class="_events-list">
          {#each schedules as item (item.seriesId)}<button class="cms-row _events-row" onclick={() =>
            go(EventsView.Series, { id: item.seriesId })}>
            <strong>{title(item.pageId)}</strong>
              <span>{scheduleLabel(item)}</span>
            <span>{ru ? 'Мест' : 'Capacity'}: {item.rules.at(-1)?.capacity}</span>
          </button>{/each}
          {#if !schedules.length}<p>{ru ? 'Периодических событий пока нет.' : 'No recurring events yet.'}</p>{/if}
        </div>
      {:else if location.view === EventsView.Series || location.view === EventsView.NewSeries}
        <button class="_events-back" disabled={mutating}
          onclick={() => go(EventsView.Schedule)}>← {ru ? 'К расписанию'
            : 'Back to schedule'}</button>
        {#key (selectedSeries?.version ?? 'new') + host.timeZone + location.view}
          <ScheduleEditor host={editorHost} selected={location.view === EventsView.Series ? selectedSeries : null}
    date={location.date}
            {occurrences} onSaved={() => {
              go(EventsView.Schedule);
              revision++;
            }} />
        {/key}
      {/if}
    {/if}
  </div>
</section>
<style>
  .events-admin { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
  .cms-tabs { padding: 0 8px; }
  .events-admin:has(> :global(._events-body[data-scrolled="true"])) > .cms-tabs { box-shadow: 0 4px 8px #252d2720; }
  ._events-body { flex: 1; min-height: 0; min-width: 0; overflow: auto; padding: 12px 12px 24px; }
  .events-breadcrumbs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--cms-muted);
    overflow-wrap: anywhere;

  }
  .events-breadcrumbs button, ._events-back {
    min-height: 44px;
    padding: 8px 0;
    border: 0;
    background: transparent;
    color: var(--cms-accent);
    font: inherit;
    font-size: 13px;
    text-align: left;
    text-decoration: underline;

  }
  ._events-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;

  }
  h1 { margin: 0; font-size: 23px; }
  ._events-zone, ._events-status { color: var(--cms-muted); font-size: 13px; }
  ._events-list { display: grid; gap: 8px; }
  ._events-row { display: grid; gap: 8px; font-size: 13px; overflow-wrap: anywhere; }
  ._events-row strong { font-size: 15px; }
  ._events-row time { font-weight: 600; color: var(--cms-accent); }
  ._events-back { display: block; margin-bottom: 12px; }
  @media (min-width: 768px) { .cms-tabs { padding: 0 16px; } ._events-body { padding: 16px 20px 24px; } }
</style>
