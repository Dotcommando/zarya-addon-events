<script lang="ts">
  import type { IAddonAdminHost } from '@zarya/addon-contracts/addons';
  import { untrack } from 'svelte';

  import { record } from './api';
  let { host }: { host: IAddonAdminHost } = $props();
  const labels = untrack(() => host.configuration.values.adminMenuLabels);
  const initial = labels && typeof labels === 'object' && !Array.isArray(labels) ? record(labels) : {};
  let en = $state(typeof initial.en === 'string' ? initial.en : '');
  let ruLabel = $state(typeof initial.ru === 'string' ? initial.ru : '');
  let saved = $state(untrack(() => JSON.stringify([en, ruLabel])));
  let busy = $state(false);
  let error = $state(false);
  let success = $state(false);
  const ru = $derived(host.language === 'ru');
  $effect(() => {
    host.setDirty(JSON.stringify([en, ruLabel]) !== saved);
  });
  async function save(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    busy = true;
    host.setBusy(true);
    error = false;
    success = false;

    try {
      await host.configure({ schemaVersion: 1, values: { adminMenuLabels: { en: en.trim(), ru: ruLabel.trim() } } });
      saved = JSON.stringify([en, ruLabel]);
      success = true;
    } catch {
      error = true;
    } finally {
      busy = false;
      host.setBusy(false);
    }
  }
</script>
<form class="events-settings" onsubmit={(e) => {
  void save(e);
}}>
  <h1>{ru ? 'Настройки событий' : 'Events settings'}</h1>
  <p>{ru ? 'Название пункта меню для каждого языка интерфейса. Пустое поле — стандартное название.'
    : 'Menu title for each interface language. Leave blank to use the default.'}</p>
  <label class="_form-field">English<input maxlength="80" bind:value={en} placeholder="Events" disabled={busy}
    /></label>
  <label class="_form-field">Русский<input maxlength="80" bind:value={ruLabel} placeholder="События"
    disabled={busy} /></label>
  <p class="cms-callout">{ru ? 'Часовой пояс берётся из Settings сайта:'
    : 'The time zone comes from site Settings:'} {host.timeZone}</p>
  {#if error}<p class="cms-error" role="alert">{ru ? 'Не удалось сохранить. Обновите данные перед повтором.'
    : 'Could not save. Refresh before retrying.'}</p>{/if}
  {#if success}<p class="cms-success" role="status">{ru ? 'Настройки сохранены.' : 'Settings saved.'}</p>{/if}
  <button class="cms-primary" disabled={busy || JSON.stringify([en, ruLabel]) === saved}>{ru ? 'Сохранить'
    : 'Save'}</button>
</form>
<style>.events-settings { max-width: 640px; } .events-settings p { font-size: 14px; line-height: 1.6; color:
    var(--cms-muted); }</style>
