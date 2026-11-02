/**
 * Кнопка «⬇» поверх медиа. Живёт в Shadow DOM, чтобы стили сайта её не ломали,
 * а наши стили не протекали на сайт.
 */

type State = 'idle' | 'loading' | 'done' | 'error';

/** Атрибут на контейнере, чтобы не ставить вторую кнопку в тот же пост. */
export const ATTACHED_ATTR = 'data-media-saver';

const ICONS: Record<State, string> = {
  idle: '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14"/>',
  loading: '<circle cx="12" cy="12" r="8" stroke-dasharray="36 14"/>',
  done: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  error: '<path d="M12 6v8m0 4v.5"/>',
};

const STYLE = `
  :host { all: initial; position: absolute; bottom: 10px; left: 10px; z-index: 10;
    opacity: 0; transition: opacity .15s; pointer-events: none; }
  :host([visible]), :host([state="loading"]), :host([state="done"]), :host([state="error"]) {
    opacity: 1; pointer-events: auto; }
  button { display: grid; place-items: center; width: 36px; height: 36px; padding: 0;
    border: none; border-radius: 50%; cursor: pointer; color: #fff;
    background: rgba(0, 0, 0, .55); backdrop-filter: blur(6px); transition: background .15s, transform .1s; }
  button:hover { background: rgba(0, 0, 0, .75); }
  button:active { transform: scale(.94); }
  button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  :host([state="done"]) button { background: rgba(22, 163, 74, .85); }
  :host([state="error"]) button { background: rgba(220, 38, 38, .85); }
  svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2;
    stroke-linecap: round; stroke-linejoin: round; }
  :host([state="loading"]) svg { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

export interface DownloadButtonOptions {
  /** Что делать по клику. Ошибка из промиса покажется в подсказке кнопки. */
  onClick: () => Promise<void>;
  title?: string;
}

/**
 * Ставит кнопку в левый нижний угол контейнера и показывает её при наведении.
 * Возвращает `null`, если кнопка там уже есть.
 */
export function attachDownloadButton(
  container: HTMLElement,
  { onClick, title = 'Скачать' }: DownloadButtonOptions,
): HTMLElement | null {
  if (container.hasAttribute(ATTACHED_ATTR)) return null;
  container.setAttribute(ATTACHED_ATTR, '');
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const host = document.createElement('media-saver-button');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${STYLE}</style><button type="button"><svg viewBox="0 0 24 24"></svg></button>`;
  const button = shadow.querySelector('button')!;
  const svg = shadow.querySelector('svg')!;

  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  const setState = (state: State, tooltip = title) => {
    host.setAttribute('state', state);
    svg.innerHTML = ICONS[state];
    button.title = tooltip;
    button.setAttribute('aria-label', tooltip);
  };
  setState('idle');

  container.addEventListener('mouseenter', () => host.setAttribute('visible', ''));
  container.addEventListener('mouseleave', () => host.removeAttribute('visible'));

  // Сайт не должен видеть нажатия на кнопку: иначе двойной клик ставит лайк, а нажатие листает карусель
  for (const type of ['pointerdown', 'mousedown', 'dblclick'] as const) {
    button.addEventListener(type, (event) => event.stopPropagation());
  }

  button.addEventListener('click', async (event) => {
    // Клик не должен открывать пост или листать карусель под кнопкой
    event.preventDefault();
    event.stopPropagation();
    if (host.getAttribute('state') === 'loading') return;
    clearTimeout(resetTimer);
    setState('loading', 'Скачивается…');
    try {
      await onClick();
      setState('done', 'Готово');
      resetTimer = setTimeout(() => setState('idle'), 2000);
    } catch (error) {
      setState('error', `Ошибка: ${error instanceof Error ? error.message : String(error)}`);
      resetTimer = setTimeout(() => setState('idle'), 5000);
    }
  });

  container.append(host);
  return host;
}
