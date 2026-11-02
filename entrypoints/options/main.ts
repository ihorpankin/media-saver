import { buildFilename } from '@/lib/core/filename';
import type { MediaPost } from '@/lib/core/media';
import { DEFAULT_SETTINGS, loadSettings, settingsItem, type Settings } from '@/lib/core/settings';

// Страница настроек. Каждое изменение сохраняется сразу, кнопки «Сохранить» нет.

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const template = $<HTMLInputElement>('#template');
const saveAs = $<HTMLInputElement>('#save-as');
const status = $<HTMLElement>('#status');

// Пример поста для предпросмотра имени файла
const sample = (count: number): MediaPost => ({
  site: 'instagram',
  postId: 'DfM_W2rE0Dp',
  author: 'patrick.ganas',
  takenAt: Date.UTC(2026, 9, 31, 12) / 1000,
  itemCount: count,
  items: [{ kind: 'image', mediaId: '4020867200000000002', index: 2, url: '', ext: 'jpg' }],
});

function renderPreview() {
  const value = template.value.trim() || DEFAULT_SETTINGS.template;
  for (const [id, count] of [
    ['#preview-carousel', 5],
    ['#preview-single', 1],
  ] as const) {
    const post = sample(count);
    $(id).textContent = `Загрузки/${buildFilename(post, post.items[0]!, value)}`;
  }
}

let statusTimer: ReturnType<typeof setTimeout> | undefined;
async function save(patch: Partial<Settings>) {
  await settingsItem.setValue({ ...(await loadSettings()), ...patch });
  status.textContent = 'Сохранено';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (status.textContent = ''), 1500);
}

async function init() {
  const settings = await loadSettings();
  template.value = settings.template;
  saveAs.checked = settings.saveAs;
  for (const radio of document.querySelectorAll<HTMLInputElement>('[name="video-quality"]')) {
    radio.checked = radio.value === settings.videoQuality;
    radio.addEventListener('change', () => {
      if (radio.checked) void save({ videoQuality: radio.value as Settings['videoQuality'] });
    });
  }
  renderPreview();

  template.addEventListener('input', renderPreview);
  // Сохраняем, когда пользователь закончил править, а не на каждую букву
  template.addEventListener('change', () => {
    template.value = template.value.trim() || DEFAULT_SETTINGS.template;
    void save({ template: template.value });
  });
  $('#reset-template').addEventListener('click', () => {
    template.value = DEFAULT_SETTINGS.template;
    renderPreview();
    void save({ template: template.value });
  });
  saveAs.addEventListener('change', () => void save({ saveAs: saveAs.checked }));
}

void init();
