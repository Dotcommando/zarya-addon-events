interface IPublicSession {
  readonly sessionId: string;
  readonly startsAt: string;
  readonly timeZone: string;
  readonly availablePlaces: number;
  readonly bookable: boolean;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid response');
  }

  return Object.fromEntries(Object.entries(value));
}

function session(value: unknown): IPublicSession {
  const row = record(value);

  if (typeof row.sessionId !== 'string' || typeof row.startsAt !== 'string'
    || !Number.isFinite(Date.parse(row.startsAt)) || typeof row.timeZone !== 'string'
    || typeof row.availablePlaces !== 'number' || typeof row.bookable !== 'boolean') {
    throw new Error('Invalid session');
  }

  return {
    sessionId: row.sessionId,
    startsAt: row.startsAt,
    timeZone: row.timeZone,
    availablePlaces: row.availablePlaces,
    bookable: row.bookable,
  };
}

function select(form: HTMLFormElement, selector: string): HTMLSelectElement {
  const field = form.querySelector(selector);

  if (!(field instanceof HTMLSelectElement)) {
    throw new Error('Missing select');
  }

  return field;
}

function button(form: HTMLFormElement, selector: string): HTMLButtonElement {
  const field = form.querySelector(selector);

  if (!(field instanceof HTMLButtonElement)) {
    throw new Error('Missing button');
  }

  return field;
}

function message(form: HTMLFormElement): HTMLElement {
  const field = form.querySelector('[data-participation-status]');

  if (!(field instanceof HTMLElement)) {
    throw new Error('Missing status');
  }

  return field;
}

function connect(form: HTMLFormElement): void {
  if (form.dataset.participationBound) {
    return;
  }
  form.dataset.participationBound = '1';
  const game = select(form, 'select[name="pageId"]');
  const sessions = select(form, 'select[name="sessionId"]');
  const submit = button(form, 'button[type="submit"]');
  const status = message(form);
  const refresh = button(form, '[data-participation-refresh]');
  const ru = form.dataset.participationLanguage === 'ru';
  let generation = 0;
  let controller: AbortController | null = null;
  let submitting = false;
  let signature = '';
  let operationKey = '';
  let accepted = false;

  if ([...game.options].some((option) => option.value === form.dataset.participationPage)) {
    game.value = form.dataset.participationPage ?? '';
  }

  async function load(): Promise<void> {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const captured = ++generation;
    const now = new Date();
    const query = new URLSearchParams({
      pageId: game.value,
      rangeStart: now.toISOString(),
      rangeEnd: new Date(now.getTime() + 366 * 86400000).toISOString(),
      limit: '100',
    });

    sessions.replaceChildren(new Option(ru ? 'Выберите дату' : 'Choose a date', ''));
    sessions.disabled = true;
    submit.disabled = true;
    status.textContent = ru ? 'Загружаем актуальные даты…' : 'Loading current dates…';

    try {
      let cursor: string | null = null;
      const seen = new Set<string>();
      let available = false;

      do {
        if (cursor) {
          query.set('cursor', cursor);
        }

        const response = await fetch('/api/sessions?' + query, { cache: 'no-store', signal });

        if (!response.ok) {
          throw new Error('Sessions unavailable');
        }

        const result = record(await response.json());

        if (captured !== generation) {
          return;
        }
        if (!Array.isArray(result.items) || result.nextCursor !== null && typeof result.nextCursor !== 'string') {
          throw new Error('Invalid list');
        }

        for (const value of result.items) {
          const item = session(value);
          const label = new Intl.DateTimeFormat(ru ? 'ru' : 'en', {
            timeZone: item.timeZone,
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(item.startsAt));
          const option = new Option(label + ' · ' + item.timeZone + ' · '
            + (ru ? 'свободно: ' : 'available: ') + item.availablePlaces, item.sessionId);

          option.disabled = !item.bookable;
          sessions.add(option);
          available ||= item.bookable;
        }
        cursor = result.nextCursor;

        if (cursor && seen.has(cursor)) {
          throw new Error('Repeated cursor');
        }
        if (cursor) {
          seen.add(cursor);
        }
      } while (cursor);
      sessions.disabled = !available;
      status.textContent = available
        ? (ru ? 'Выберите встречу и заполните контакты.' : 'Choose a session and enter your contact details.')
        : (ru ? 'Сейчас нет доступных встреч.' : 'No sessions are currently available.');
    } catch {
      if (captured === generation && !signal.aborted) {
        status.textContent = ru ? 'Расписание недоступно. Попробуйте обновить даты.'
          : 'The schedule is unavailable. Try refreshing dates.';
      }
    }
  }

  game.addEventListener('change', () => {
    accepted = false;
    void load();
  });
  refresh.addEventListener('click', () => {
    void load();
  });
  form.addEventListener('input', () => {
    accepted = false;
    submit.disabled = submitting || !sessions.value || sessions.disabled;
  });
  sessions.addEventListener('change', () => {
    accepted = false;
    submit.disabled = submitting || !sessions.value;
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (submitting || accepted || !form.reportValidity() || !sessions.value) {
      return;
    }

    const data = new FormData(form);
    const payload = {
      sessionId: sessions.value,
      places: Number(data.get('places')),
      contact: {
        name: String(data.get('name') ?? ''),
        phone: String(data.get('phone') ?? ''),
        email: String(data.get('email') ?? ''),
      },
    };
    const nextSignature = JSON.stringify(payload);

    if (nextSignature !== signature) {
      signature = nextSignature;
      operationKey = crypto.randomUUID();
    }
    submitting = true;
    submit.disabled = true;
    game.disabled = true;
    sessions.disabled = true;
    refresh.disabled = true;
    status.textContent = ru ? 'Отправляем заявку…' : 'Submitting request…';
    void (async (): Promise<void> => {
      try {
        const response = await fetch('/api/participation-requests', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-Zarya-Request': '1', 'Idempotency-Key': operationKey },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          if (response.status === 409) {
            await load();
          }
          throw new Error('Request unavailable');
        }

        const result = record(await response.json());

        if (typeof result.requestReference !== 'string' || result.state !== 'Pending') {
          throw new Error('Invalid receipt');
        }
        accepted = true;
        status.textContent = (ru ? 'Заявка принята и ожидает подтверждения организатора. Номер: '
          : 'Request received and awaiting organizer confirmation. Reference: ') + result.requestReference;
      } catch {
        status.textContent = ru ? 'Не удалось отправить заявку. Проверьте контакты и дату, затем повторите.'
          : 'The request could not be completed. Check your contacts and date, then retry.';
      } finally {
        submitting = false;
        game.disabled = false;
        sessions.disabled = accepted || sessions.options.length <= 1;
        refresh.disabled = false;
        submit.disabled = accepted || !sessions.value || sessions.disabled;
      }
    })();
  });
  void load();
}

for (const form of document.querySelectorAll('form[data-participation-form]')) {
  if (form instanceof HTMLFormElement) {
    connect(form);
  }
}
