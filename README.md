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

## Установка сборки вручную

1. `npm run build`
2. Открыть `chrome://extensions`, включить «Режим разработчика».
3. «Загрузить распакованное расширение» → выбрать папку `.output/chrome-mv3`.
