# Freecam — независимая камера для Twitch

**Новый эксперимент: один видеопоток вместо отдельного сервера камеры.** Игра и камера занимают разные области общего кадра OBS, а устанавливаемое браузерное расширение собирает изображение у зрителя. [Инструкция, компоновка OBS и границы проверки](SINGLE-STREAM.md). Это отдельный прототип, не нативное Twitch Extension; совместимость с живым Twitch пока не подтверждена.

React + TypeScript + Vite, Node.js EBS, MediaMTX и OBS Virtual Camera / FFmpeg. Реализованы нативный Video Overlay, отдельный веб-плеер, настройки стримера, реальная HLS-доставка камеры, индивидуальные перемещение/размер/скрытие/задержка и восстановление подключения.

**Граница готовности:** это исполняемая реализация MVP, не опубликованное и не одобренное Twitch расширение. Для реального эфира нужны Twitch Extension ID/secret, OBS, работающий видеосервер и HTTPS. Строгая синхронизация со стандартным Twitch-плеером невозможна; используется приближённая автоматическая оценка с ручной поправкой. Мобильное приложение Twitch не считаем поддерживающим desktop overlay.

Сначала прочитайте [проверку реализуемости и архитектуру](ARCHITECTURE.md). Здесь нет статичных изображений, подменяющих камеру. Пока источник не публикуется, интерфейс показывает отсутствие сигнала.

## Содержание

- [Что получает зритель](#что-получает-зритель)
- [Локальный запуск на Windows](#быстрый-локальный-запуск-windows)
- [Настройка OBS](#obs-без-второго-twitch-эфира)
- [Установка Twitch Extension](#установка-twitch-extension)
- [Развёртывание на сервере](#production-deployment)
- [Переменные окружения](#переменные)
- [Тесты и структура проекта](#файлы-и-проверки)
- [Типичные проблемы](#типичные-проблемы)
- [Известные ограничения](#известные-ограничения)

## Что получает зритель

- Независимый видеослой камеры поверх основной трансляции.
- Перемещение мышью или касанием, изменение размера с сохранением пропорций.
- Скрытие, показ и возврат к положению, выбранному стримером.
- Индивидуальные настройки для каждого канала с сохранением в браузере.
- Настройку задержки камеры и автоматическое переподключение.

```text
OBS Program (игра + микрофон) ──────────────────→ Twitch → основной плеер
OBS Virtual Camera (только камера) → FFmpeg → MediaMTX → HLS → видеослой зрителя
```

Камеру требуется отправлять отдельно: расширение не извлекает её из готового изображения Twitch. Перемещение камеры не меняет основной эфир или настройки других зрителей.

## Быстрый локальный запуск (Windows)

Требуется Node.js 22.12+ (предпочтительно актуальный LTS), npm, FFmpeg в PATH и запущенный Docker Desktop с Linux containers. Node 18 системы устарел; проект содержит локальный Node 22 как devDependency, но первичную установку лучше выполнять системным Node 22+. При ошибках native binding после установки под Node 18 повторите `npm install --include=optional` уже под Node 22.

Сначала клонируйте репозиторий и перейдите в его папку:

```powershell
git clone https://github.com/bimo0o/freecam-twitch.git
cd freecam-twitch
```

Проверить установленные инструменты можно командами `node --version`, `npm --version`, `ffmpeg -version`, `docker info`. Docker Desktop должен быть запущен до следующего шага.

```powershell
npm ci
npm run setup
docker compose up -d
npm run server
```

В другом терминале:

```powershell
npm run dev
```

Оставьте оба терминала открытыми. Первый обслуживает API на `127.0.0.1:3000`, второй — интерфейс на `127.0.0.1:5173`. Третий терминал потребуется для отправки камеры из OBS.

Откройте [локальную панель](http://localhost:5173/?view=config&channel=1). Число `1` — локальное пространство настройки, не заранее подключённый Twitch-канал. Для настоящего канала замените LOCAL_CHANNEL_ID в `.env` и `channel` в URL его числовым ID. Ключ LOCAL_ADMIN_SECRET возьмите из `.env`, введите в панель, укажите настоящее имя канала, включите камеру и сохраните. Локальный ключ не работает в production. Реквизиты публикации доступны кнопкой только после авторизации.

Затем настройте OBS, запустите отправку камеры по инструкции ниже и откройте [просмотр](http://localhost:5173/?channel=1). Основной Twitch embed требует действительно идущего эфира. Локальное видео камеры можно проверить отдельно даже без Twitch; тестовый генератор включается только явным `--testsrc` и не является камерой.

### OBS без второго Twitch-эфира

1. В основной сцене оставьте игру/экран и микрофон. Уберите встроенную камеру — вырезать её из уже скомпонованного Twitch-видео расширение не может.
2. Создайте отдельный источник камеры. В OBS возле **Start Virtual Camera → ⚙ → Output Type: Source** выберите только этот источник (или отдельную Scene с камерой). Включите Virtual Camera. Program продолжает отдавать игру в Twitch.
3. Установите FFmpeg. Проверьте имя устройства: `ffmpeg -list_devices true -f dshow -i dummy`.
4. Запустите из папки проекта:

```powershell
$env:CAM_DEVICE='OBS Virtual Camera'
$env:CAM_RESOLUTION='1280x720'
$env:CAM_FPS='30'
$env:CAM_BITRATE='1200'
node scripts/publish-camera.mjs
```

Из локального `.env` helper берёт канал и вычисляет его пароль. На другом компьютере передайте через окружение **только** CAM_CHANNEL_ID и CAM_PUBLISH_PASSWORD, полученный из защищённой панели, и CAM_RTMP_SERVER. Master secret переносить на компьютер зрителя/источника не требуется. Helper не печатает пароль и перезапускает FFmpeg при завершении процесса. Пока приложение открыто, Ctrl+C завершает helper и FFmpeg. Для unattended-вещания используйте службу/планировщик и мониторинг.

Стартовый профиль: H.264 baseline, yuv420p, без B frames, ключевой кадр каждую секунду, без аудио. Для 4:3 установите, например, CAM_RESOLUTION=960x720 и такие же пропорции в панели. Параметры разрешения/FPS/битрейта в панели сохраняют профиль, но не управляют OBS удалённо. Применяйте их в OBS/helper самостоятельно.

RTMP без шифрования разрешён только через localhost или защищённый туннель/VPN. Production Compose оставляет RTMP на localhost сервера: используйте SSH forwarding `ssh -N -L 1935:127.0.0.1:1935 user@server` и локальный адрес helper. Для прямого подключения нужен RTMPS с валидным сертификатом и отдельной настройкой MediaMTX; в шаблоне он не включён.

### Альтернативная публикация через WHIP

MediaMTX принимает WHIP: `https://INGEST_DOMAIN/cam/CHANNEL_ID/whip`, Bearer token берётся из защищённой панели. В OBS выберите Service=WHIP, Server и Bearer Token. Для этого нужен **отдельный camera-only output/instance**; переключение основного OBS на WHIP прекратит его обычную отправку в Twitch. Основной документированный сценарий с Virtual Camera этой проблемы не имеет. WHEP клиент не включён: он не решает проблему буферизации камеры под задержку Twitch. UDP 8189 должен быть доступен, PUBLIC_IP должен соответствовать серверу; за сложным NAT может потребоваться TURN, который в MVP не включён.

## Проверка управления

Наведите на камеру: панель ⠿ перемещает, угловой маркер ◢ меняет размер, × скрывает. Кнопка слева внизу возвращает камеру; ⚙ меняет поправку задержки; ↺ восстанавливает параметры стримера. Pointer Events поддерживают мышь и touch. Ширина хранится долей области просмотра, x/y — долей свободного пространства. Размеры пересчитываются ResizeObserver, включая fullscreen. Кнопка fullscreen внешнего сайта разворачивает общий контейнер; fullscreen внутри Twitch iframe может показать только основное видео.

Настройки хранятся в localStorage по каналу в данном браузере, не отправляются стримеру и другим зрителям. Две независимые сессии проверяйте разными профилями/приватными окнами. При запрете storage сохранение между посещениями недоступно. Браузер может блокировать autoplay — появится кнопка запуска. Звук камеры всегда выключен; слушайте микрофон из Twitch.

## Установка Twitch Extension

1. Создайте Extension в [Developer Console](https://dev.twitch.tv/console/extensions). Выберите **Video Overlay**, configuration view — `config.html`, viewer view — `overlay.html`. Не объявляйте desktop overlay как mobile overlay.
2. Запишите base64 Extension Secret в TWITCH_EXTENSION_SECRET на backend. Он никогда не попадает в VITE-переменные/ZIP.
3. Установите VITE_API_BASE=https://APP_DOMAIN; ALLOWED_ORIGINS должен включать точный origin расширения `https://EXTENSION_ID.ext-twitch.tv` и origin внешнего сайта. Для Local Test добавьте точный dev origin. CSP настраивается в Console, не HTML meta.
4. `npm run build`. Все пути относительные, JS не минифицирован; hls.js вынесен отдельным читаемым файлом, worker/eval не используются.
5. Загружайте содержимое dist в ZIP **в корне архива**. Helper подключён первым в overlay.html и config.html. index.html — отдельный внешний сайт; исключите его из ZIP расширения, он содержит Twitch embed, который нельзя использовать внутри расширения. Общие JS assets оставить все.
6. В Console добавьте APP_DOMAIN в **Allowlist for URL Fetching Domains** и **Media Domains**: hls.js получает плейлисты/сегменты через fetch, Safari — через video. Укажите все фактически запрашиваемые URL при submission. Никаких внешних iframe в overlay/config.
7. Local/Hosted Test: настройте extension на своём канале. Helper автоматически выдаст JWT. Backend разрешит изменения только broadcaster соответствующего канала. Проверьте настоящий эфир, рекламу, паузу, theater/fullscreen, разные браузеры и роли viewer/broadcaster перед submission.
8. Отправьте на Twitch review с рабочим источником камеры, инструкцией и включённым эфиром на review channel. Публикация/одобрение пользователем ещё не выполнены.

Не добавляйте ссылку на альтернативный сайт в Extension без проверки ограничений off-site links в policies. В этой реализации такой ссылки в native overlay нет.

## Production deployment

Linux VPS, Docker Compose, DNS APP_DOMAIN и INGEST_DOMAIN на публичный IP. Откройте 80/443 TCP, 8189 UDP только если используете WHIP. Не выставляйте 3000/8888/8889/1935 наружу. Начните с `npm run setup`, заполните `.env`:

```dotenv
NODE_ENV=production
TWITCH_EXTENSION_SECRET=BASE64_SECRET_FROM_CONSOLE
APP_DOMAIN=cam.your-domain.example
INGEST_DOMAIN=ingest.your-domain.example
PUBLIC_IP=PUBLIC_SERVER_IP
ALLOWED_ORIGINS=https://EXTENSION_ID.ext-twitch.tv,https://cam.your-domain.example
```

Генератор создал секреты публикации/callback и infra/mediamtx.local.yml. Не коммитьте их. Запускайте production файл отдельно, без слияния с локальным Compose:

```sh
docker compose -f compose.production.yml up -d --build
```

Caddy выдаёт HTTPS. Production backend не принимает локальный admin secret: конфигурируйте из Twitch. Для native assets сделайте отдельную сборку с VITE_API_BASE и загрузите её в Twitch. Внешний сайт из Docker использует same-origin API. Канальные настройки хранятся в channel-data; делайте backup volume. Секреты храните в секрет-хранилище при расширении инфраструктуры. Логи edge не включены, чтобы не писать callback/publisher credentials.

Health endpoint `/api/health` проверяет backend, **не наличие видеопотока**. Наличие кадров и состояние подключения видно в камере. Для мониторинга MediaMTX настройте закрытые API/metrics отдельно.

## Переменные

| Переменная | Назначение |
|---|---|
| TWITCH_EXTENSION_SECRET | base64 HS256 secret, только сервер |
| PUBLISH_MASTER_SECRET | генерация паролей публикации по каналам |
| MEDIA_AUTH_SECRET | callback и внутреннее чтение HLS |
| LOCAL_ADMIN_SECRET / LOCAL_CHANNEL_ID | только локальная настройка одного канала |
| HOST / PORT / DATA_DIR | адрес backend и хранилище JSON |
| MEDIA_INTERNAL_URL | закрытый HTTP HLS origin MediaMTX |
| ALLOWED_ORIGINS | точные разрешённые CORS origins через запятую |
| VITE_API_BASE | публичный EBS URL, встраивается при сборке |
| APP_DOMAIN / INGEST_DOMAIN / PUBLIC_IP | TLS edge и ICE |
| CAM_CHANNEL_ID / CAM_PUBLISH_PASSWORD | credentials helper на другом компьютере |
| CAM_DEVICE / CAM_RESOLUTION / CAM_FPS / CAM_BITRATE | источник и encoder |
| CAM_RTMP_SERVER / FFMPEG_BIN | ingest URL без credentials и путь FFmpeg |

## Файлы и проверки

```text
src/          React: viewer, overlay, camera controls, HLS, settings
shared/       schemas, positioning and sync bounds
server/       EBS, JWT checks, persistence, MediaMTX auth and HLS proxy
infra/        Caddy and generated private MediaMTX configuration
scripts/      setup and real OBS Virtual Camera publisher
tests/        security, geometry, persistence and streaming/UI tests
docs/         feasibility, architecture and verification record
compose*.yml  local media server and production stack
```

```sh
npm test
npm run build
```

Результаты и границы фактически выполненной проверки записаны в [docs/VALIDATION.md](VALIDATION.md). Синтетический FFmpeg источник допустим только для проверки передачи кадров; он не подтверждает захват физической камеры, Twitch review или синхронизацию живого эфира.

### Упаковка расширения

Готовые сборки, локальные секреты и загруженные инструменты не хранятся в Git. Создайте ZIP из исходников после настройки публичного `VITE_API_BASE`:

```powershell
npm run build
New-Item -ItemType Directory -Force -Path artifacts | Out-Null
Compress-Archive -Path dist/overlay.html,dist/config.html,dist/assets -DestinationPath artifacts/freecam-extension.zip -Force
```

В ZIP входят `overlay.html`, `config.html` и `assets/`. Не добавляйте `.env`, приватные ключи, настройки MediaMTX с секретами или `index.html` внешнего сайта.

## Типичные проблемы

| Симптом | Что проверить |
|---|---|
| Docker не подключается к daemon | Запустите Docker Desktop с Linux containers и повторите `docker info`. |
| Камера показывает «Нет сигнала» | OBS Virtual Camera включена; helper запущен; канал совпадает; `docker compose logs media` показывает публикацию H.264. |
| Сохранение отклонено: 403 | Локальный ключ соответствует `.env` и `LOCAL_CHANNEL_ID`. В production нужен JWT стримера из Twitch, локальный ключ отключён. |
| Основной экран пуст или Twitch офлайн | В панели указано настоящее имя канала, идёт эфир, embed открыт с корректным `parent` hostname. |
| Видео не запускается автоматически | Нажмите «Включить видео»; проверьте разрешения autoplay браузера. |
| Камера опережает речь | Увеличьте поправку задержки через ⚙; микрофон должен идти только через Twitch. |
| Расширение работает локально, но не в Twitch | Проверьте HTTPS, `VITE_API_BASE` при сборке, CORS origin и обе allowlist доменов в Developer Console. |
| FFmpeg не видит OBS Virtual Camera | Проверьте точное имя устройства через DirectShow и задайте `CAM_DEVICE`. Helper захвата камеры рассчитан на Windows. |
| В свежем клоне нет файла MediaMTX | Выполните `npm run setup`: приватная конфигурация намеренно генерируется локально. |

Для остановки завершите helper и оба сервера через Ctrl+C, затем выполните `docker compose down`. Команда без `-v` сохраняет данные Docker volumes. Не публикуйте `.env` или реквизиты публикации при отправке логов.

## Известные ограничения

- Нет гарантированной покадровой/губной синхронизации с Twitch. Внешний сайт не получает Helper telemetry. Калибруйте по речи/хлопку/действию, увеличивая задержку, когда камера спешит.
- Native overlay работает в пределах Twitch iframe и под контролами плеера; safe zones могут перехватывать мышь. На телефонах гарантируем pointer управление внешнего сайта, не overlay в приложении Twitch.
- HLS добавляет задержку и расход трафика. Один профиль, без адаптивного битрейта. Пока камера выключена зрителем/вкладка скрыта, медиаподключение освобождается.
- Включённая камера публична. Нет подписочных/платных прав доступа, CDN, автоматической ротации publish credentials и глобального bandwidth quota.
- Один backend, файловая конфигурация. Горизонтальное масштабирование требует общего хранилища и отдельного медиа/edge слоя. Тысячи зрителей не прошли нагрузочное тестирование.
- OBS/FFmpeg надо запустить на стороне стримера; панель не меняет hardware encoder или настройки OBS удалённо. Дополнительный encode расходует CPU; аппаратный encoder — следующий этап с проверкой совместимости H.264.
