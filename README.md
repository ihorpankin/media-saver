# Media Saver

Расширение для Chrome: скачивание медиа из соцсетей одним кликом. План работ — в [ROADMAP.md](ROADMAP.md), заметки по Instagram — в [docs/instagram.md](docs/instagram.md).

## Что умеет

Кнопка ⬇ встраивается в родную панель действий поста; то же — в подменю «Media Saver» по правому клику. Интерфейс расширений — на английском.

| Сайт      | Что скачивает                                                                              |
| --------- | ------------------------------------------------------------------------------------------ |
| Instagram | фото, карусели (текущий слайд или «All N»), видео и Reels, сторис, хайлайты, оригинал «HD» |
| X         | фото в оригинале, видео и GIF                                                              |
| TikTok    | видео и фото-посты                                                                         |
| LinkedIn  | фото и видео из постов                                                                     |

YouTube — отдельное расширение **Media Saver for YouTube** в этом же репозитории (см. ниже): ему нужен хелпер на компьютере и права, которые Web Store не пропустит.

Файлы сохраняются в `Загрузки/<сайт>/<автор>/<id>_<n>.<ext>` (шаблон меняется в настройках).

## Как устроено

- `entrypoints/<сайт>-page.content.ts` — скрипт в контексте страницы (MAIN world): перехватывает данные, которые сайт и так получает (XHR/fetch, встроенный JSON), и передаёт их content script.
- `entrypoints/<сайт>.content.ts` — кнопки на странице, выбор, что скачать. Общие части — в `lib/content/` и `lib/ui/`.
- `entrypoints/background.ts` + `lib/background/` — скачивание через `chrome.downloads`, контекстное меню, оригиналы через фоновую вкладку, yt-dlp.
- `entrypoints/offscreen/` — склейка видео и звука DASH (Instagram) и сохранение байтов, скачанных страницей (TikTok).
- `lib/sites/<сайт>/` — разбор данных сайта, покрыт тестами.

## Разработка

```bash
npm install
npm run dev      # сборка в .output/chrome-mv3-dev с горячей перезагрузкой
npm run build    # сборка в .output/chrome-mv3
npm run compile  # проверка типов
npm test         # тесты (vitest)
npm run lint
npm run format
```

### Подключение dev-сборки (один раз)

1. Запустить `npm run dev` и не закрывать.
2. В обычном Chrome открыть `chrome://extensions`, включить «Режим разработчика».
3. «Загрузить распакованное расширение» → папка `.output/chrome-mv3-dev`.

Дальше изменения в коде подхватываются сами, пока работает `npm run dev`.

## Media Saver for YouTube

Отдельное расширение: кнопки «Video» и «Thumbnail» под роликом и в Shorts, превью из любой ленты — по правому клику. Код — `apps/youtube/` и общий `lib/`, конфиг — `wxt.youtube.config.ts`.

```bash
npm run dev:youtube    # .output/youtube/chrome-mv3-dev, можно параллельно с npm run dev
npm run build:youtube  # .output/youtube/chrome-mv3
```

Подключается так же, как основное: «Загрузить распакованное расширение» → папка сборки.

### Хелпер yt-dlp (один раз)

Видео с YouTube качает [yt-dlp](https://github.com/yt-dlp/yt-dlp) на компьютере, расширение передаёт ему ссылку через Native Messaging (`native-host/`). Превью работают и без этого.

```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
powershell -ExecutionPolicy Bypass -File native-host\install.ps1
```

`install.ps1` регистрирует хелпер для Chrome в реестре текущего пользователя (без прав администратора) и записывает точные пути к `node`, `yt-dlp` и `ffmpeg` (`host-run.bat`, `host-config.json`): Chrome запускает хелпер со своим PATH, который может быть старше установки yt-dlp. Если переустановили или обновили эти программы через winget и путь поменялся — запустите `install.ps1` ещё раз. Удалить регистрацию: `install.ps1 -Uninstall`.

Видео сохраняются в `Загрузки\youtube\<канал>\<название> [id].mp4`. Качество выбирается в меню по правому клику: «Media Saver for YouTube ▸ Video: …». Если YouTube начнёт отдавать ошибки про PO Token — обновите yt-dlp (`winget upgrade yt-dlp.yt-dlp`) и при необходимости поставьте плагин [bgutil-ytdlp-pot-provider](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide).

## Установка для постоянного использования

```bash
npm run pack
```

Собирает оба расширения в постоянные папки `release/media-saver` и `release/media-saver-youtube`. Один раз: удалить dev-версии в `chrome://extensions` (у них тот же id), включить «Режим разработчика», «Загрузить распакованное расширение» → эти папки. Дальше после каждого `npm run pack` достаточно нажать ⟳ у расширения. Перед обновлением стоит пройтись по [чек-листу](docs/checklist.md).

Иконки рисуются из `icons/*.svg` командой `npm run icons`.

## Публикация в Chrome Web Store

`npm run zip:store` собирает архив Media Saver без поля `key`. Тексты для карточки, обоснование разрешений и порядок действий — в [docs/store.md](docs/store.md), политика конфиденциальности — [docs/privacy.md](docs/privacy.md).
