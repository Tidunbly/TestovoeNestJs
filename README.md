
## Overview
Микросервис сканирования открытых портов (`nmap`) и сопоставления с локальной БД CVE (NVD API). Сервис ежедневно инициирует фоновые задачи: сканирование портов для выбранных IP и подтягивание новых записей CVE из внешнего API. Результаты сохраняются в PostgreSQL; история фоновых заданий и снимки портов накапливаются.

## Technology Stack
| Компонent           | Технология                              |
| ------------------- | --------------------------------------- |
| Runtime / фреймворк | **Node.js**, **NestJS**, **TypeScript** |
| ORM                 | **TypeORM**                             |
| БД                  | **PostgreSQL**                          |
| Скан                | **nmap** (в контейнере)                 |
| CVE                 | **NVD REST API**                        |
| Контейнер           | **Docker**, образ Node Alpine           |

## Project Structure
```
nvd-scanner/
├── src/
│   ├── app.controller.ts
│   ├── app.module.ts
│   ├── main.ts
│   ├── modules/
│   │   ├── cve/                  # Модуль работы с CVE
│   │   │   ├── cve.module.ts
│   │   │   ├── cve.service.ts
│   │   │   ├── repositories/
│   │   │   │   └── cve.repository.ts
│   │   │   └── types/
│   │   │       └── entities/
│   │   │           └── cve.entity.ts
│   │   ├── jobs/                 # Модуль фоновых задач (планировщик и workers)
│   │   │   ├── jobs.controller.ts
│   │   │   ├── jobs.module.ts
│   │   │   ├── jobs.scheduler.ts
│   │   │   ├── jobs.service.ts
│   │   │   ├── repositories/
│   │   │   │   ├── cve-sync-job.repository.ts
│   │   │   │   └── port-scan-job.repository.ts
│   │   │   ├── types/
│   │   │   │   ├── job-status.enum.ts
│   │   │   │   └── entities/
│   │   │   │       ├── cve-sync-job.entity.ts
│   │   │   │       └── port-scan-job.entity.ts
│   │   │   └── workers/
│   │   │       ├── cve-sync.worker.ts
│   │   │       └── port-scan.worker.ts
│   │   ├── scan/                 # Модуль сканирования портов и получения состояния
│   │   │   ├── scan.controller.ts
│   │   │   ├── scan.module.ts
│   │   │   ├── scan.service.ts
│   │   │   ├── dto/
│   │   │   │   └── get-current-state.dto.ts
│   │   │   ├── repositories/
│   │   │   │   └── scan.repository.ts
│   │   │   ├── types/
│   │   │   │   └── entities/
│   │   │   │       ├── port-snapshot.entity.ts
│   │   │   │       ├── port.entity.ts
│   │   │   │       └── service-version.entity.ts
│   │   └── targets/              # Модуль управления целями (IP/домены)
│   │       ├── targets.controller.ts
│   │       ├── targets.module.ts
│   │       ├── targets.service.ts
│   │       ├── dto/
│   │       ├── add-targets.dto.ts
│   │       └── toggle-target.dto.ts
│   │       ├── repositories/
│   │       │   └── scan-target.repository.ts
│   │       ├── services/
│   │       │   └── target-resolver.service.ts
│   │       └── types/
│   │           └── entities/
│   │               └── scan-target.entity.ts
│   └── test/
│       ├── app.e2e-spec.ts
│       └── jest-e2e.json
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started

### Local Development
1. Установить зависимости:
   ```bash
   npm install
   ```
2. Создать `.env` (можно скопировать из `.env.example`).
3. Запустить приложение:
   ```bash
   npm run start:dev
   ```
4. Приложение доступно на `http://localhost:3000`, префикс API: `/api`.

#### Запуск через docker compose
```bash
docker compose up --build
```
Сервисы:
- `app` (NestJS, порт `3000`)
- `postgres` (PostgreSQL 16, порт `5432`)


## API Endpoints
- **Добавить цели сканирования**: `POST /api/targets`
- **Включить/выключить цель**: `PATCH /api/targets/toggle`
- **Принудительно поставить daily jobs в очередь**: `POST /api/jobs/run-daily`
- **Текущее состояние**: `GET /api/scan/state`
