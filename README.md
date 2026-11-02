# Media Saver

Расширение для Chrome: скачивание медиа из соцсетей одним кликом. План работ — в [ROADMAP.md](ROADMAP.md), заметки по Instagram — в [docs/instagram.md](docs/instagram.md).

## Разработка

```bash
npm install
npm run dev      # открывает отдельный Chrome с расширением и горячей перезагрузкой
npm run build    # сборка в .output/chrome-mv3
npm run compile  # проверка типов
npm run lint
npm run format
```

`npm run dev` использует отдельный профиль Chrome в `.chrome-profile/`. Вход в Instagram там нужно выполнить один раз, дальше он сохраняется.

## Установка сборки вручную

1. `npm run build`
2. Открыть `chrome://extensions`, включить «Режим разработчика».
3. «Загрузить распакованное расширение» → выбрать папку `.output/chrome-mv3`.
