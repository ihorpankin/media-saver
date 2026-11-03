/**
 * A short message at the bottom of the screen, so the user sees the error text and not just a red
 * icon. A separate element in `body`, not next to the button: site bars often clip
 * anything that goes past their edges. A new message replaces the old one.
 */

const STYLE = `
  :host { all: initial; position: fixed; left: 50%; bottom: 24px; z-index: 2147483647;
    transform: translateX(-50%); max-width: min(480px, calc(100vw - 32px)); }
  div { box-sizing: border-box; padding: 10px 14px; border-radius: 10px;
    background: #1f1f1f; color: #fff; box-shadow: 0 4px 16px rgba(0, 0, 0, .3);
    font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; cursor: pointer;
    animation: in .15s ease-out; }
  b { color: #f87171; font-weight: 600; }
  @keyframes in { from { opacity: 0; transform: translateY(8px); } }
`;

let current: { host: HTMLElement; timer: ReturnType<typeof setTimeout> } | undefined;

export function showError(message: string) {
  if (current) {
    clearTimeout(current.timer);
    current.host.remove();
  }
  const host = document.createElement('media-saver-toast');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${STYLE}</style><div role="alert"><b>Media Saver:</b> </div>`;
  const box = shadow.querySelector('div')!;
  box.append(message);
  box.title = 'Close';
  const close = () => {
    host.remove();
    if (current?.host === host) current = undefined;
  };
  box.addEventListener('click', close);
  document.body.append(host);
  current = { host, timer: setTimeout(close, 6000) };
}
