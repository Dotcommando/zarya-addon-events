<script lang="ts">
  import { Temporal } from '@js-temporal/polyfill';
  import type { IAddonAdminHost } from '@zarya/addon-contracts/addons';
  import { untrack } from 'svelte';

  import type { IEvent, ISeries } from './api';
  import { displayPattern, type IPatternForm, toUtcPattern } from './calendar';
  let { host, selected, date, occurrences, onSaved }: { host: IAddonAdminHost;
    selected: ISeries | null;
    date: string;
    occurrences: readonly IEvent[];
    onSaved: () => void } = $props();
  const initialForm = untrack(() => selected ? displayPattern(selected.rules.at(-1)!.pattern, host.timeZone) : {
    startsOn: date,
    endsOn: '',
    localTime: '12:00',
    everyWeeks: 1,
    weekdays: [Temporal.PlainDate.from(date).dayOfWeek],
    durationMinutes: 60,
  });
  let form = $state<IPatternForm>(initialForm);
  let pageId = $state(untrack(() => selected?.pageId ?? host.pages[0]?.pageId ?? ''));
  let capacity = $state(untrack(() => selected?.rules.at(-1)?.capacity ?? 8));
  const initial = untrack(() => JSON.stringify([form, pageId, capacity]));
  let busy = $state(false);
  let error = $state(false);
  const ru = $derived(host.language === 'ru');
  const weekdays = $derived(ru ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri',
    'Sat', 'Sun']);
  const count = $derived(occurrences.filter((item) => Date.parse(item.startsAt) > Date.now()).length);
  $effect(() => {
    host.setDirty(JSON.stringify([form, pageId, capacity]) !== initial);
  });
  async function save(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    busy = true;
    host.setBusy(true);
    error = false;

    try {
      const pattern = toUtcPattern(form, host.timeZone);

      await host.request(selected ? '/session-series/' + selected.seriesId + '/schedule' : '/session-series', selected
        ? { expectedVersion: selected.version, scope: 'Series', sessionId: null, pattern, capacity }
        : { pageId, pattern, capacity });
      host.setDirty(false);
      host.setBusy(false);
      onSaved();
    } catch {
      error = true;
    } finally {
      busy = false;
      host.setBusy(false);
    }
  }
</script>
<div class="schedule-editor">
  <h1>{selected ? (ru ? 'Изменить расписание' : 'Edit schedule') : (ru ? 'Новое расписание' : 'New schedule')}</h1>
  <p class="cms-callout">{ru ? 'Время вводится в часовом поясе сайта:'
    : 'Times are entered in the site time zone:'} {host.timeZone}.
    {ru ? 'Повторения сохраняются в UTC. Смена часового пояса сайта меняет только отображение.'
      : 'Recurrences are stored in UTC. Changing the site time zone only changes their display.'}</p>
  {#if error}<p class="cms-error" role="alert">{ru
    ? 'Изменение не выполнено. Проверьте вместимость и даты. При конфликте обновите данные перед повтором.'
    : 'The change failed. Check capacity and dates. Refresh before retrying a conflict.'}</p>{/if}
  <form onsubmit={(e) => {
    void save(e);
  }}>
    <fieldset class="_schedule-fields" disabled={busy || !selected && !host.enabled}>
      <label class="_form-field">{ru ? 'Страница события' : 'Event page'}
        <select bind:value={pageId} required disabled={selected !== null}>
          {#each host.pages as item (item.pageId)}<option value={item.pageId}>{item.title}</option>{/each}
        </select>
      </label>
      <label class="_form-field">{ru ? 'Начало расписания' : 'Schedule starts'}<input type="date"
    bind:value={form.startsOn} required /></label>
      <label class="_form-field">{ru ? 'Время начала' : 'Start time'} · {host.timeZone}<input type="time"
    bind:value={form.localTime} required /></label>
      <label class="_form-field">{ru ? 'Длительность, минут' : 'Duration, minutes'}<input type="number" min="1"
    step="1" bind:value={form.durationMinutes} required /></label>
      <label class="_form-field">{ru ? 'Каждые N недель' : 'Every N weeks'}<input type="number" min="1" step="1"
    bind:value={form.everyWeeks} required /></label>
      <label class="_form-field">{ru ? 'Количество мест' : 'Capacity'}<input type="number" min="1" step="1"
    bind:value={capacity} required /></label>
      <fieldset class="_schedule-weekdays"><legend>{ru ? 'Дни недели' : 'Weekdays'}</legend>
        {#each weekdays as label, index (index)}<label><input type="checkbox" bind:group={form.weekdays}
    value={index + 1} />{label}</label>{/each}
      </fieldset>
      <label class="_form-field">{ru ? 'Последний день (необязательно)' : 'Last date (optional)'}<input
    type="date" min={form.startsOn} bind:value={form.endsOn} /></label>
      {#if selected}<div class="cms-callout _schedule-impact">
        <strong>{ru ? 'Будущих встреч в серии' : 'Future occurrences in this series'}: {count}</strong>
        <p>{ru ? 'Изменение применяется ко всей серии будущих встреч. Прошедшие встречи, заявки '
        + 'участников и индивидуальные исключения сохраняются. Лишние встречи отменяются.'
          : 'Applies to the entire future series. Past meetings, participation requests and '
        + 'individual exceptions are retained. Excess occurrences are cancelled.'}</p>
        {#if occurrences.length}<details><summary>{ru ? 'Показать встречи' : 'Show occurrences'}</summary>
          <ul>{#each occurrences as item (item.sessionId)}<li>{new Intl.DateTimeFormat(host.language, {
            timeZone: host.timeZone,
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(item.startsAt))}</li>{/each}</ul>
        </details>{/if}
      </div>{/if}
      <div class="_schedule-actions"><button class="cms-primary" disabled={!pageId || !form.weekdays.length}>
        {selected ? (ru ? 'Применить к будущим встречам серии' : 'Apply to future series occurrences') : (ru
          ? 'Создать расписание' : 'Create schedule')}</button></div>
    </fieldset>
  </form>
</div>
<style>
  .schedule-editor { max-width: 960px; }
  h1 { margin-top: 0; font-size: 24px; }
  ._schedule-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding: 0;
    border: 0;
    min-width: 0;

  }
  ._schedule-weekdays {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    border: 0;
    padding: 0;
    margin: 0 0 24px;
    min-width: 0;

  }
  ._schedule-weekdays legend { margin-bottom: 8px; font-size: 13px; font-weight: 600; }
  ._schedule-weekdays label {
    display: flex;
    gap: 6px;
    align-items: center;
    min-height: 44px;
    padding: 0 8px;
    background: var(--cms-row);
    border-radius: 7px;
    font-size: 13px;

  }
  ._schedule-weekdays input { width: 18px; height: 18px; padding: 0; accent-color: var(--cms-accent); }
  ._schedule-impact, ._schedule-actions { grid-column: 1 / -1; margin-bottom: 16px; }
  ._schedule-impact p { line-height: 1.6; }
  ._schedule-impact summary { min-height: 44px; padding: 12px 0; }
  ._schedule-impact ul { padding-left: 20px; max-height: 220px; overflow: auto; }
  @media (min-width: 768px) {
    ._schedule-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 20px;

  }
  }
</style>
