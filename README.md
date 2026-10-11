# frinumarket

Магазин плагинов для [Inugram](https://github.com/teidesu/inugram): плагин внутри приложения, который берёт каталог из публичного Telegram‑канала.

- Канал: https://t.me/frinu_store
- Бот: https://t.me/frinustore_bot (принимает плагины от авторов, ведёт каталог)

## Как это устроено

1. В канале закреплён документ `catalog.json`, ниже лежат файлы `.inu.js` (по сообщению на версию).
2. Бот принимает плагины, публикует файлы и пересобирает `catalog.json`.
3. Плагин `market` читает закреп, показывает список, а для установки открывает сообщение с файлом, и штатный установщик Inugram ставит его.
4. При установке плагин шлёт боту inline‑запрос `install <id> <version>`, бот считает установки.

Подробности: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). ТЗ бота: [docs/BOT_SPEC.md](docs/BOT_SPEC.md).

## Структура

```
inu.config.ts          манифест и гранты плагина
src/market/            плагин (index.ts, icons.ts)
src/shared/catalog.ts  схема catalog.json (общая с ботом)
docs/                  архитектура и ТЗ бота
```

## Запуск

Нужен [Bun](https://bun.sh).

```bash
bun install
bun run check     # манифест, гранты, типы
bun run build     # dist/market.inu.js
```

Разработка на телефоне (Inugram запущен, режим разработчика включён, отладка по adb):

```bash
adb connect <ip>:<port>
bun run dev -s <ip>:<port>        # сборка и перезагрузка при каждом сохранении
bun x inu push -s <ip>:<port>     # разовая загрузка
bun x inu list                    # установленные плагины
```

Если пакет приложения называется не `desu.inugram`, добавьте `--app <имя.пакета>`.

## Где искать в приложении

- боковое меню (или ⋮ на главном экране): «Магазин плагинов»;
- Настройки → Плагины → кнопка «Настройки» у плагина.

## Гранты плагина

`account.read(peers)`, `account.read(messages)`, `invokeRpc(messages.search)`, `invokeRpc(messages.getInlineBotResults)`, `openUrl`. Без `unsafe.*`.

## Настройка

В `src/market/index.ts` заданы `CHANNEL` (`frinu_store`) и `BOT` (`frinustore_bot`). У бота должен быть включён inline mode (`/setinline` в BotFather).

## Известные ограничения

- Публичного API установки плагина нет: установка идёт через тап по файлу в открытом сообщении (проверить на устройстве).
- Нет API списка установленных плагинов, поэтому статусов «установлен» и «есть обновление» нет.
- Ссылка на репозиторий обязательна для каждого плагина (задача бота: [docs/BOT_TASK_REPO.md](docs/BOT_TASK_REPO.md)).
- Иконки только встроенные, эмодзи и стикеры, произвольных картинок нет.
