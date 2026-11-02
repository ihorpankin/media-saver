/**
 * Кнопка «⬇» и, для каруселей, «Все N». Два вида:
 *   - встроенная в панель действий сайта (рядом с лайком): `createInlineButton`;
 *   - поверх медиа при наведении, где панели нет (плитки сеток): `attachOverlayButton`.
 * Живёт в Shadow DOM, чтобы стили сайта её не ломали, а наши стили не протекали на сайт.
 */

/** `waiting` — медиа ещё грузится на странице, скачивать пока нечего. */
type State = 'idle' | 'waiting' | 'loading' | 'done' | 'error';

/** Атрибут на контейнере, чтобы не ставить вторую кнопку в то же место. */
export const ATTACHED_ATTR = 'data-media-saver';

const ICONS: Record<State, string> = {
  idle: '<path d="M12 3.5v12m0 0-5-5m5 5 5-5M4.5 20h15"/>',
  waiting: '<circle cx="12" cy="12" r="8" stroke-dasharray="36 14"/>',
  loading: '<circle cx="12" cy="12" r="8" stroke-dasharray="36 14"/>',
  done: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  error: '<path d="M12 6v8m0 4v.5"/>',
};

const BASE_STYLE = `
  button { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: 0; border: none; background: none; color: inherit; cursor: pointer;
    font: 600 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif; }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 6px; }
  button:disabled { cursor: default; opacity: .6; }
  .all[hidden], .original[hidden] { display: none; }
  .original { font-size: 11px; letter-spacing: .02em; padding: 3px 6px;
    border: 1.5px solid currentColor; border-radius: 6px; }
  svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2;
    stroke-linecap: round; stroke-linejoin: round; }
  :host([state="done"]) .main { color: #16a34a; }
  :host([state="error"]) .main { color: #dc2626; }
  :host([state="loading"]) svg, :host([state="waiting"]) svg { animation: spin .8s linear infinite; }
  :host([state="waiting"]) .main { opacity: .5; cursor: default; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

/** Встроенная кнопка: строка (лента, пост, сторис) или колонка (Reels). */
const INLINE_STYLE = `
  :host { display: inline-flex; align-items: center; gap: 10px; color: inherit; }
  :host([layout="column"]) { flex-direction: column; gap: 4px; }
  .main { padding: 8px; }
  :host([layout="column"]) .main { padding: 0; }
  .all:hover, .main:hover, .original:hover { opacity: .7; }
`;

/** Кнопка поверх медиа: полупрозрачный кружок, появляется при наведении. */
const OVERLAY_STYLE = `
  :host { all: initial; position: absolute; bottom: 10px; left: 10px; z-index: 2147483000;
    display: flex; gap: 6px; align-items: center; color: #fff;
    opacity: 0; transition: opacity .15s; pointer-events: none; }
  :host([visible]), :host([state="loading"]), :host([state="done"]), :host([state="error"]) {
    opacity: 1; pointer-events: auto; }
  button { height: 36px; border-radius: 18px; background: rgba(0, 0, 0, .55);
    backdrop-filter: blur(6px); transition: background .15s, transform .1s; }
  button:hover { background: rgba(0, 0, 0, .75); }
  button:active { transform: scale(.94); }
  .main { width: 36px; }
  .all, .original { padding: 0 12px; border: none; border-radius: 18px; font-size: 13px; }
  svg { width: 20px; height: 20px; stroke-width: 2.2; }
  :host([state="done"]) .main { color: #fff; background: rgba(22, 163, 74, .85); }
  :host([state="error"]) .main { color: #fff; background: rgba(220, 38, 38, .85); }
`;

export interface DownloadButtonOptions {
  /** Что делать по клику. Ошибка из промиса покажется в подсказке кнопки. */
  onClick: () => Promise<void>;
  title?: string;
  /** Кнопка «Все N». Показывается, только если `count()` больше 1. */
  all?: {
    count: () => number | undefined;
    onClick: () => Promise<void>;
  };
  /** Кнопка «HD …» для оригинала. Показывается, только если `label()` что-то вернул. */
  original?: {
    label: () => { text: string; title: string } | undefined;
    onClick: () => Promise<void>;
  };
}

interface Control {
  host: HTMLElement;
  /** Пересчитать «Все N» (данные поста могли прийти после того, как кнопку поставили). */
  refresh: () => void;
}

/** Переключатели ожидания для каждой кнопки: состояние живёт внутри замкнутого Shadow DOM. */
const waitingSetters = new WeakMap<HTMLElement, (waiting: boolean) => void>();

/** Показать или снять ожидание загрузки. Не трогает кнопку во время скачивания и сразу после. */
export function setWaiting(host: HTMLElement, waiting: boolean) {
  waitingSetters.get(host)?.(waiting);
}

function createControl(
  style: string,
  { onClick, title = 'Скачать', all, original }: DownloadButtonOptions,
): Control {
  const host = document.createElement('media-saver-button');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${BASE_STYLE}${style}</style>
    <button type="button" class="main"><svg viewBox="0 0 24 24"></svg></button>
    <button type="button" class="all" hidden></button>
    <button type="button" class="original" hidden></button>`;
  const mainButton = shadow.querySelector<HTMLButtonElement>('.main')!;
  const allButton = shadow.querySelector<HTMLButtonElement>('.all')!;
  const originalButton = shadow.querySelector<HTMLButtonElement>('.original')!;
  const svg = shadow.querySelector('svg')!;

  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  const setState = (state: State, tooltip = title) => {
    host.setAttribute('state', state);
    svg.innerHTML = ICONS[state];
    mainButton.title = tooltip;
    mainButton.setAttribute('aria-label', tooltip);
    allButton.disabled = state === 'loading';
    originalButton.disabled = state === 'loading';
  };
  setState('idle');

  waitingSetters.set(host, (waiting) => {
    const state = host.getAttribute('state');
    if (waiting && state === 'idle') setState('waiting', 'Ждём, пока загрузится…');
    else if (!waiting && state === 'waiting') setState('idle');
  });

  const refresh = () => {
    const count = all?.count() ?? 0;
    allButton.hidden = count < 2;
    allButton.textContent = `Все ${count}`;
    allButton.title = `Скачать все ${count}`;

    const hd = original?.label();
    originalButton.hidden = !hd;
    originalButton.textContent = hd?.text ?? '';
    originalButton.title = hd?.title ?? '';
  };

  const run = async (task: () => Promise<void>) => {
    const current = host.getAttribute('state');
    if (current === 'loading' || current === 'waiting') return;
    clearTimeout(resetTimer);
    setState('loading', 'Скачивается…');
    try {
      await task();
      setState('done', 'Готово');
      resetTimer = setTimeout(() => setState('idle'), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[media-saver] скачивание не удалось:', error);
      setState('error', `Ошибка: ${message}`);
      resetTimer = setTimeout(() => setState('idle'), 5000);
    }
  };

  for (const [button, task] of [
    [mainButton, onClick],
    [allButton, all?.onClick],
    [originalButton, original?.onClick],
  ] as const) {
    // Сайт не должен видеть нажатия на кнопки: иначе двойной клик ставит лайк, а нажатие листает карусель
    for (const type of ['pointerdown', 'mousedown', 'dblclick'] as const) {
      button.addEventListener(type, (event) => event.stopPropagation());
    }
    button.addEventListener('click', (event) => {
      // Клик не должен открывать пост или переключать сторис под кнопкой
      event.preventDefault();
      event.stopPropagation();
      if (task) void run(task);
    });
  }

  return { host, refresh };
}

/**
 * Кнопка для панели действий сайта. Вызывающий сам вставляет `host` в нужное место.
 * Цвет наследуется от панели, поэтому кнопка выглядит как родная и в светлой, и в тёмной теме.
 */
export function createInlineButton(
  layout: 'row' | 'column',
  options: DownloadButtonOptions,
): HTMLElement {
  const { host, refresh } = createControl(INLINE_STYLE, options);
  host.setAttribute('layout', layout);
  refresh();
  // Данные поста могут прийти позже, чем появилась панель: пересчитываем при наведении
  host.addEventListener('mouseenter', refresh);
  return host;
}

/**
 * Ставит кнопку в левый нижний угол контейнера и показывает её при наведении.
 * Возвращает `null`, если кнопка там уже есть.
 */
export function attachOverlayButton(
  container: HTMLElement,
  options: DownloadButtonOptions,
): HTMLElement | null {
  if (container.hasAttribute(ATTACHED_ATTR)) return null;
  container.setAttribute(ATTACHED_ATTR, '');
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const { host, refresh } = createControl(OVERLAY_STYLE, options);
  container.addEventListener('mouseenter', () => {
    refresh();
    host.setAttribute('visible', '');
  });
  container.addEventListener('mouseleave', () => host.removeAttribute('visible'));
  container.append(host);
  return host;
}
