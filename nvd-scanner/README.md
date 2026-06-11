# NVD Scanner (NestJS Test Task)

Микросервис сканирования открытых портов (`nmap`) и сопоставления с локальной БД CVE (NVD API).

## Локальный запуск (без Docker)

1. Установить зависимости:

```bash
npm install
```

2. Создать `.env` (можно скопировать из `.env.example`).

3. Запустить приложение:

```bash
npm run start:dev
```

Приложение доступно на `http://localhost:3000`, префикс API: `/api`.

## Docker

### Запуск через docker compose

```bash
docker compose up --build
```

Сервисы:
- `app` (NestJS, порт `3000`)
- `postgres` (PostgreSQL 16, порт `5432`)

Остановка:

```bash
docker compose down
```

Остановка с удалением тома БД:

```bash
docker compose down -v
```

## Полезные эндпоинты для smoke-проверки

- Добавить цели сканирования: `POST /api/targets`
- Включить/выключить цель: `PATCH /api/targets/toggle`
- Принудительно поставить daily jobs в очередь: `POST /api/jobs/run-daily`
- Текущее состояние: `GET /api/scan/state`

## Тесты и сборка

```bash
npm run build
npm test -- jobs.service.spec.ts
```
