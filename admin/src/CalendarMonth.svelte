<script lang="ts">
  import { Temporal } from '@js-temporal/polyfill';

  import type { IEvent } from './api';
  import { calendarDays, localDate } from './calendar';
  let { month, today, language, timeZone, events, titles, busy, onMonth, onDay, onEvent }: {
    month: string;
    today: string;
    language: 'ru' | 'en';
    timeZone: string;
    titles: readonly { pageId: string;
      title: string }[];
    events: readonly IEvent[];
    busy: boolean;
    onMonth: (month: string) => void;
    onDay: (date: string) => void;
    onEvent: (id: string, date: string) => void;
  } = $props();
  const ru = $derived(language === 'ru');
  const current = $derived(Temporal.PlainYearMonth.from(month));
  const cells = $derived(calendarDays(month));
  const weekdays = $derived(ru ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const months = $derived(Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(language, {
    month: 'long', timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, index, 1)))));
  function title(id: string): string {
    return titles.find((item) => item.pageId === id)?.title ?? id;
  }
  function changeMonth(value: number): void {
    if (Number.isInteger(value) && value >= 1 && value <= 12) {
      onMonth(current.with({ month: value }).toString());
    }
  }
  function changeYear(value: number): void {
    if (Number.isInteger(value) && value >= 1 && value <= 9999) {
      onMonth(current.with({ year: value }).toString());
    }
  }
  function dayLabel(date: string): string {
    return Temporal.PlainDate.from(date).toLocaleString(language, { dateStyle: 'full' });
  }
  function time(value: string): string {
    return new Intl.DateTimeFormat(language, { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }
</script>
<div class="calendar-toolbar">
  <div class="_calendar-step">
    <button class="cms-secondary" disabled={busy} onclick={() => onMonth(today.slice(0, 7))}>{ru ? 'Сегодня'
      : 'Today'}</button>
    <button class="cms-secondary _calendar-arrow" disabled={busy || current.year === 1 && current.month === 1}
      aria-label={ru ? 'Предыдущий месяц' : 'Previous month'}
      onclick={() => onMonth(current.subtract({ months: 1 }).toString())}>‹</button>
    <button class="cms-secondary _calendar-arrow" disabled={busy || current.year === 9999 && current.month === 12}
      aria-label={ru ? 'Следующий месяц' : 'Next month'}
      onclick={() => onMonth(current.add({ months: 1 }).toString())}>›</button>
  </div>
  <div class="_calendar-period">
    <label><span class="_calendar-label">{ru ? 'Месяц' : 'Month'}</span>
      <select value={current.month} disabled={busy} onchange={(e) => changeMonth(Number(e.currentTarget.value))}>
        {#each months as label, index (index)}<option value={index + 1}>{label}</option>{/each}
      </select>
    </label>
    <label><span class="_calendar-label">{ru ? 'Год' : 'Year'}</span>
      <input type="number" min="1" max="9999" step="1" value={current.year} disabled={busy}
        onchange={(e) => changeYear(Number(e.currentTarget.value))} />
    </label>
  </div>
</div>
<p class="_calendar-zone">{timeZone}</p>
<div class="month-grid" aria-label={ru ? 'Календарь событий' : 'Events calendar'} aria-busy={busy}>
  {#each weekdays as weekday (weekday)}<div class="_calendar-weekday">{weekday}</div>{/each}
  {#each cells as date (date)}
    {@const dayEvents = events.filter((item) => localDate(item.startsAt, timeZone) === date)}
    <div class="_calendar-cell" class:_calendar-cell__outside={!date.startsWith(month)}
      class:_calendar-cell__today={date === today}>
      <button class="_calendar-day" aria-label={dayLabel(date) + ' · ' + dayEvents.length}
        aria-current={date === today ? 'date' : undefined} disabled={busy} onclick={() => onDay(date)}>
        <span>{Number(date.slice(-2))}</span>
        {#if dayEvents.length}<span class="_calendar-count">{dayEvents.length}</span>{/if}
      </button>
      <div class="_calendar-entries">
        {#each dayEvents.slice(0, 2) as item (item.sessionId)}
          <button class="_calendar-event" class:_calendar-event__cancelled={item.status === 'Cancelled'} disabled={busy}
            onclick={() => onEvent(item.sessionId, date)} title={time(item.startsAt) + ' ' + title(item.pageId)}>
            <time>{time(item.startsAt)}</time> <span>{title(item.pageId)}</span>
            {#if item.status === 'Cancelled'}<span>{ru ? '(отменено)' : '(cancelled)'}</span>{/if}
          </button>
        {/each}
        {#if dayEvents.length > 2}<button class="_calendar-more" disabled={busy} onclick={() => onDay(date)}>
          {ru ? 'Ещё' : 'More'} {dayEvents.length - 2}</button>{/if}
      </div>
    </div>
  {/each}
</div>
<style>
  .calendar-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-end;
    justify-content: space-between;

  }
  ._calendar-step { display: flex; gap: 6px; }
  ._calendar-arrow { width: 44px; padding: 0; font-size: 25px; }
  ._calendar-period {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 100px;
    gap: 8px;
    flex: 1 1 240px;
    max-width: 360px;

  }
  ._calendar-period label { min-width: 0; }
  ._calendar-label { display: block; margin-bottom: 4px; font-size: 12px; color: var(--cms-muted); }
  ._calendar-zone { margin: 8px 0 12px; font-size: 12px; color: var(--cms-muted); }
  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    border-top: 1px solid var(--cms-border);
    border-left: 1px solid var(--cms-border);
    border-radius: 8px;
    overflow: hidden;

  }
  ._calendar-weekday {
    padding: 10px 0;
    text-align: center;
    font-size: 11px;
    border-right: 1px solid var(--cms-border);
    border-bottom: 1px solid var(--cms-border);
    background: var(--cms-row);
    color: var(--cms-muted);

  }
  ._calendar-cell {
    position: relative;
    min-width: 0;
    min-height: 68px;
    border-right: 1px solid var(--cms-border);
    border-bottom: 1px solid var(--cms-border);
    background: var(--cms-surface);

  }
  ._calendar-cell__outside { background: var(--cms-row); }
  ._calendar-cell__outside ._calendar-day { color: var(--cms-muted); }
  ._calendar-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 5px;
    width: 100%;
    min-height: 67px;
    padding: 7px 0;
    border: 0;
    background: transparent;
    color: var(--cms-ink);
    font: inherit;
    font-size: 12px;

  }
  ._calendar-day > span:first-child {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;

  }
  ._calendar-day[aria-current="date"] > span:first-child { background: var(--cms-accent); color: #fff; }
  ._calendar-count {
    display: grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 3px;
    border-radius: 9px;
    background: var(--cms-row-hover);
    color: var(--cms-accent);
    font-size: 10px;

  }
  ._calendar-entries { display: none; }
  ._calendar-event, ._calendar-more {
    display: block;
    width: 100%;
    min-width: 0;
    min-height: 28px;
    padding: 4px;
    border: 0;
    border-radius: 4px;
    background: var(--cms-row);
    color: var(--cms-accent);
    font: inherit;
    font-size: 11px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

  }
  ._calendar-event:hover { background: var(--cms-row-hover); }
  ._calendar-event__cancelled { color: var(--cms-muted); text-decoration: line-through; }
  ._calendar-more { background: transparent; }
  @media (min-width: 576px) {
    ._calendar-cell { min-height: 108px; }
    ._calendar-day {
      position: absolute;
      inset: 0;
      min-height: 36px;
      flex-direction: row;
      align-items: flex-start;
      justify-content: center;
      padding: 6px 0;
    }
    ._calendar-entries {
      position: relative;
      margin-top: 36px;
      pointer-events: none;
      display: grid;
      gap: 3px;
      padding: 0 3px 5px;
    }
    ._calendar-event, ._calendar-more { pointer-events: auto; }
    ._calendar-event span { display: none; }
    ._calendar-weekday { font-size: 12px; }
  }
  @media (min-width: 768px) {
    ._calendar-cell { min-height: 104px; }
    ._calendar-event span { display: inline; }
    ._calendar-period { flex-grow: 0; }
  }
  @media (min-width: 992px) { ._calendar-cell { min-height: 104px; } ._calendar-event { font-size: 12px; } }
  @media (min-width: 1200px) {
    ._calendar-cell {
    min-height: 104px;

  } ._calendar-entries {
    padding: 0 6px 6px;

  }
  }
</style>
