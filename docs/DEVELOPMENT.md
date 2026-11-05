# Разработка и проверки

Пользовательское описание и быстрый старт находятся в [README](../README.md). Здесь собраны команды проверки и воспроизведения материалов.

## Проверки

```powershell
npm test
npm run build
```

Браузерным тестам нужен запущенный `npm run dev` и подготовленные файлы:

```powershell
npm run demo:sync
node scripts/generate-packed-demo.mjs
node scripts/generate-packed-demo.mjs --unmarked
npm run test:packed
```

Тест Manifest V3 использует отдельный профиль и копию manifest с тестовым доступом только к localhost. Публичный manifest имеет доступ только к Twitch; localhost добавляется лишь в тестовую копию:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/playwright-browsers"
npm exec playwright install chromium
npm run test:extension
```

## GIF в README

Первая GIF записана с работающего локального обработчика; вторая — анимированная схема реализации, преимуществ и ограничений. Требуются Node.js 22.12+, FFmpeg и Edge на Windows. Для другого браузера доступна переменная `BROWSER_BIN` с абсолютным путём к Chromium/Chrome.

```powershell
# Первая GIF: нужен работающий npm run dev и стенд npm run demo:sync
node scripts/generate-readme-preview.mjs
# Вторая GIF: локальный сервер не требуется
node scripts/generate-implementation-preview.mjs
```

Результаты: `docs/assets/freecam-preview.gif`, `docs/assets/freecam-how-it-works.gif`. Временные PNG-кадры сохраняются в игнорируемой `.tools/`.

## Материалы

- [Компоновка OBS и устройство обработчика](SINGLE-STREAM.md)
- [Стенд живого Twitch-эфира и чеклист](STREAM-TEST.md)
- [Предыдущая архитектура с двумя потоками](LEGACY-TWO-STREAM.md)
- [Исходный архитектурный разбор](ARCHITECTURE.md)
- [Предыдущие результаты проверки](VALIDATION.md)

Первая GIF теперь использует отдельные пользовательские записи: [происхождение материалов](assets/CREDITS.md). Перед её генерацией выполните `scripts/prepare-presentation.mjs` с путями к этим файлам. Для проверки интерфейса мастера OBS доступен `npm exec playwright test tests/setup.spec.ts`; OBS в этом тесте заменён протокольным сервером.
