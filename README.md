
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
docker-compose up --build
```
Сервисы:
- `app` (NestJS, порт `3000`)
- `postgres` (PostgreSQL 16, порт `5432`)


