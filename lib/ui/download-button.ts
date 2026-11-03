/**
 * The "⬇" button and, for carousels, "All N". Two kinds:
 *   - embedded in the site's action bar (next to Like): `createInlineButton`;
 *   - over the media on hover, where there is no bar (grid tiles): `attachOverlayButton`.
 * Lives in Shadow DOM so the site's styles don't break it and ours don't leak into the site.
 */

import { showError } from './toast';

/** `waiting`: the media is still loading on the page, nothing to download yet. */
type State = 'idle' | 'waiting' | 'loading' | 'done' | 'error';

/** Attribute on the container, so a second button isn't placed in the same spot. */
const ATTACHED_ATTR = 'data-media-saver';

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
  .label:empty { display: none; }
  .label { font-variant-numeric: tabular-nums; }
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

/** Inline button: a row (feed, post, stories) or a column (Reels). */
const INLINE_STYLE = `
  :host { display: inline-flex; align-items: center; gap: 10px; color: inherit; }
  :host([layout="column"]) { flex-direction: column; gap: 4px; }
  .main { padding: 8px; }
  :host([layout="column"]) .main { padding: 0; }
  .all:hover, .main:hover, .original:hover { opacity: .7; }
  /* Compact, when the site's row has no room: just the icon, "All N" as a badge on its corner */
  :host([compact]) { position: relative; }
  :host([compact]) .main { padding: 0; }
  :host([compact]) .original { display: none; }
  :host([compact]) .all { position: absolute; top: -7px; right: -9px; min-width: 16px; height: 16px;
    padding: 0 4px; border-radius: 8px; background: #0095f6; color: #fff; font-size: 10px; }
  /* Shorts column: icon in a circle, label below. Colors are set by the caller from the neighboring button */
  :host([layout="circle"]) { flex-direction: column; }
  :host([layout="circle"]) .main { flex-direction: column; gap: 6px; padding: 0;
    font: 400 12px/18px Roboto, Arial, sans-serif; }
  :host([layout="circle"]) svg { box-sizing: content-box; padding: 12px; border-radius: 50%;
    background: var(--media-saver-circle, rgba(127, 127, 127, .2)); }
  :host([layout="circle"]) .main:hover { opacity: 1; }
  :host([layout="circle"]) .main:hover svg { filter: brightness(1.4); }
`;

/** Button over the media: a translucent circle that appears on hover. */
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
  /** What to do on click. An error from the promise shows in the button tooltip and at the bottom of the screen. */
  onClick: () => Promise<void>;
  title?: string;
  /** Label next to the icon, e.g. "Video". While downloading, the percentage takes its place. */
  label?: string;
  /** The "All N" button. Shown only if `count()` is greater than 1. */
  all?: {
    count: () => number | undefined;
    onClick: () => Promise<void>;
  };
  /** The "HD …" button for the original. Shown only if `label()` returned something. */
  original?: {
    label: () => { text: string; title: string } | undefined;
    onClick: () => Promise<void>;
  };
}

interface Control {
  host: HTMLElement;
  /** Recount "All N" (the post data may arrive after the button was placed). */
  refresh: () => void;
}

/** Waiting toggles for each button: the state lives inside the closed Shadow DOM. */
const waitingSetters = new WeakMap<HTMLElement, (waiting: boolean) => void>();

/** Show or clear the waiting state. Doesn't touch the button during a download or right after. */
export function setWaiting(host: HTMLElement, waiting: boolean) {
  waitingSetters.get(host)?.(waiting);
}

/** Percentage updates during a long download (YouTube video via yt-dlp). */
const progressSetters = new WeakMap<HTMLElement, (percent: number) => void>();

export function setProgress(host: HTMLElement, percent: number) {
  progressSetters.get(host)?.(percent);
}

/** Which button action to trigger from outside. */
export type ButtonAction = 'slide' | 'all' | 'original';

/** Button actions to trigger from outside, from the context menu. */
const actions = new WeakMap<HTMLElement, (action: ButtonAction) => void>();

/**
 * Press the button programmatically: with the spinner, checkmark and error text, as on a click.
 * Grid tiles have one action, the whole post, and it answers any request.
 */
export function triggerDownload(host: HTMLElement, action: ButtonAction = 'slide'): boolean {
  const trigger = actions.get(host);
  trigger?.(action);
  return Boolean(trigger);
}

function createControl(
  style: string,
  { onClick, title = 'Download', label, all, original }: DownloadButtonOptions,
): Control {
  const host = document.createElement('media-saver-button');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${BASE_STYLE}${style}</style>
    <button type="button" class="main"><svg viewBox="0 0 24 24"></svg><span class="label"></span></button>
    <button type="button" class="all" hidden></button>
    <button type="button" class="original" hidden></button>`;
  const mainButton = shadow.querySelector<HTMLButtonElement>('.main')!;
  const allButton = shadow.querySelector<HTMLButtonElement>('.all')!;
  const originalButton = shadow.querySelector<HTMLButtonElement>('.original')!;
  const svg = shadow.querySelector('svg')!;
  const labelSpan = shadow.querySelector<HTMLElement>('.label')!;

  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  const setState = (state: State, tooltip = title) => {
    host.setAttribute('state', state);
    svg.innerHTML = ICONS[state];
    labelSpan.textContent = label ?? '';
    mainButton.title = tooltip;
    mainButton.setAttribute('aria-label', tooltip);
    allButton.disabled = state === 'loading';
    originalButton.disabled = state === 'loading';
  };
  setState('idle');

  progressSetters.set(host, (percent) => {
    if (host.getAttribute('state') !== 'loading') return;
    labelSpan.textContent = `${percent}%`;
    mainButton.title = `Downloading… ${percent}%`;
  });

  waitingSetters.set(host, (waiting) => {
    const state = host.getAttribute('state');
    if (waiting && state === 'idle') setState('waiting', 'Waiting for media to load…');
    else if (!waiting && state === 'waiting') setState('idle');
  });

  const refresh = () => {
    const count = all?.count() ?? 0;
    allButton.hidden = count < 2;
    allButton.textContent = host.hasAttribute('compact') ? String(count) : `All ${count}`;
    allButton.title = `Download all ${count}`;

    const hd = original?.label();
    originalButton.hidden = !hd;
    originalButton.textContent = hd?.text ?? '';
    originalButton.title = hd?.title ?? '';
  };

  const run = async (task: () => Promise<void>) => {
    const current = host.getAttribute('state');
    if (current === 'loading' || current === 'waiting') return;
    clearTimeout(resetTimer);
    setState('loading', 'Downloading…');
    try {
      await task();
      setState('done', 'Done');
      resetTimer = setTimeout(() => setState('idle'), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[media-saver] download failed:', error);
      setState('error', `Error: ${message}`);
      showError(message);
      resetTimer = setTimeout(() => setState('idle'), 5000);
    }
  };
  actions.set(host, (action) => {
    if (action === 'all' && all) void run(all.onClick);
    else if (action === 'original') {
      void run(original?.onClick ?? (() => Promise.reject(new Error('no larger original here'))));
    } else void run(onClick);
  });

  for (const [button, task] of [
    [mainButton, onClick],
    [allButton, all?.onClick],
    [originalButton, original?.onClick],
  ] as const) {
    // The site must not see presses on the buttons: otherwise a double click likes the post and a press swipes the carousel
    for (const type of ['pointerdown', 'mousedown', 'dblclick'] as const) {
      button.addEventListener(type, (event) => event.stopPropagation());
    }
    button.addEventListener('click', (event) => {
      // The click must not open the post or switch the story under the button
      event.preventDefault();
      event.stopPropagation();
      if (task) void run(task);
    });
  }

  return { host, refresh };
}

/**
 * A button for the site's action bar. The caller inserts `host` where it belongs.
 * The color is inherited from the bar, so the button looks native in both light and dark themes.
 *
 * `fitWithin` is the site's row holding the button. If the full button makes it overflow
 * (a narrow post column where the icons also have counters), the button turns compact.
 */
export function createInlineButton(
  layout: 'row' | 'column' | 'circle',
  options: DownloadButtonOptions,
  fitWithin?: Element,
): HTMLElement {
  const { host, refresh } = createControl(INLINE_STYLE, options);
  host.setAttribute('layout', layout);

  const update = () => {
    if (fitWithin) {
      host.removeAttribute('compact');
      refresh();
      if (fitWithin.scrollWidth > fitWithin.clientWidth + 1) host.setAttribute('compact', '');
    }
    refresh();
  };
  // The row's width is set by the page, not by the button, so toggling doesn't loop
  if (fitWithin) new ResizeObserver(update).observe(fitWithin);
  update();
  // Post data may arrive after the bar appeared: recount on hover
  host.addEventListener('mouseenter', update);
  return host;
}

/**
 * Places the button in the bottom-left corner of the container and shows it on hover.
 * Returns `null` if the button is already there.
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
