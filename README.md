# Media Saver

Расширение для Chrome: скачивание медиа из соцсетей одним кликом. План работ — в [ROADMAP.md](ROADMAP.md), заметки по Instagram — в [docs/instagram.md](docs/instagram.md).

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

## Видео с YouTube: хелпер yt-dlp (один раз)

Видео с YouTube качает [yt-dlp](https://github.com/yt-dlp/yt-dlp) на компьютере, расширение передаёт ему ссылку через Native Messaging (`native-host/`). Превью работают и без этого.

```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
powershell -ExecutionPolicy Bypass -File native-host\install.ps1
```

`install.ps1` регистрирует хелпер для Chrome в реестре текущего пользователя (без прав администратора) и записывает точные пути к `node`, `yt-dlp` и `ffmpeg` (`host-run.bat`, `host-config.json`): Chrome запускает хелпер со своим PATH, который может быть старше установки yt-dlp. Если переустановили или обновили эти программы через winget и путь поменялся — запустите `install.ps1` ещё раз. Удалить регистрацию: `install.ps1 -Uninstall`.

Видео сохраняются в `Загрузки\youtube\<канал>\<название> [id].mp4`. Качество берётся из настроек расширения. Если YouTube начнёт отдавать ошибки про PO Token — обновите yt-dlp (`winget upgrade yt-dlp.yt-dlp`) и при необходимости поставьте плагин [bgutil-ytdlp-pot-provider](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide).

## Установка сборки вручную

1. `npm run build`
2. Открыть `chrome://extensions`, включить «Режим разработчика».
3. «Загрузить распакованное расширение» → выбрать папку `.output/chrome-mv3`.
