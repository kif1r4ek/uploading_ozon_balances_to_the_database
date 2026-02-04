# Инструкция по развертыванию uploading_ozon_balances_to_the_database

Пошаговая инструкция для развертывания скрипта выгрузки **остатков товаров Ozon FBO** на сервере Ubuntu 24.04 с FASTPANEL.

## Описание

Скрипт:
- Использует **Ozon Seller API** (POST /v1/analytics/stock_on_warehouses)
- Выгружает остатки товаров только на складах Ozon (модель FBO)
- Получает список всех товаров продавца через /v3/product/list
- Сохраняет данные в PostgreSQL с защитой от дубликатов (UPSERT)
- Ведёт технические логи выполнения в БД
- Запускается каждые 30 минут через cron

---

## API Ozon Seller

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/v3/product/list` | Получить список товаров продавца |
| POST | `/v3/product/info/list` | Получить детали товаров |
| POST | `/v1/analytics/stocks` | Получить остатки на складах |

### Заголовки авторизации

| Заголовок | Описание |
|-----------|----------|
| `Client-Id` | Идентификатор клиента (числовой) |
| `Api-Key` | API-ключ (UUID формат) |

### Лимиты API Ozon

| Ограничение | Значение |
|-------------|----------|
| Запросов в минуту | ~60 |
| Записей на страницу (limit) | До 1000 |

### Структура ответа `/v1/analytics/stocks`

```json
{
  "result": {
    "rows": [
      {
        "sku": 123456789,
        "product_id": 987654321,
        "offer_id": "ARTICLE-001",
        "item_name": "Название товара",
        "item_code": "CODE-001",
        "warehouse_id": 12345,
        "warehouse_name": "Склад Ozon",
        "warehouse_type": "fbo",
        "free_to_sell_amount": 100,
        "promised_amount": 10,
        "reserved_amount": 5
      }
    ]
  }
}
```

### Поля остатков

| Поле | Описание |
|------|----------|
| `free_to_sell_amount` | Доступно для продажи |
| `promised_amount` | Ожидается поставка |
| `reserved_amount` | Зарезервировано |
| `warehouse_type` | Тип склада (fbo/fbs) |

---

## Требования

- Ubuntu 24.04
- Node.js 18.x или выше
- PostgreSQL (доступ к БД)
- API токен Ozon (Client-Id и Api-Key)

---

## Шаг 1: Подключение к серверу

### Через SSH:
```bash
ssh root@109.73.194.111
# Пароль: w8hDWrMybh6-bH
```

---

## Шаг 2: Проверка Node.js

```bash
node --version
# Ожидается: v18.19.1 или выше

npm --version
# Ожидается: 10.x или выше
```

Если Node.js не установлен:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs
```

---

## Шаг 3: Копирование проекта на сервер

### Вариант A: Через SCP
```bash
scp -r uploading_ozon_balances_to_the_database root@109.73.194.111:/opt/
# Пароль: w8hDWrMybh6-bH
```

### Вариант B: Через SCP (архив)
```bash
scp uploading_ozon_balances_to_the_database.zip root@109.73.194.111:/opt/
ssh root@109.73.194.111
cd /opt
unzip uploading_ozon_balances_to_the_database.zip
```

### Вариант C: Через Git
```bash
cd /opt
git clone <URL_репозитория> uploading_ozon_balances_to_the_database
```

---

## Шаг 4: Установка зависимостей

```bash
cd /opt/uploading_ozon_balances_to_the_database
npm install
```

### Ожидаемый вывод:
```
added 2 packages in 2s
```

---

## Шаг 5: Настройка конфигурации (.env)

```bash
nano .env
```

Заполните `.env`:

```env
# Ozon Seller API
OZON_CLIENT_ID=2843272
OZON_API_KEY=76fb74b8-0018-48f6-aa5b-ba7e04cff1a2
OZON_API_URL=https://api-seller.ozon.ru

# PostgreSQL Database
PG_HOST=176.124.219.60
PG_PORT=5432
PG_USER=gen_user
PG_PASSWORD=y>D4~;f^YLgFA|
PG_DATABASE=default_db

# Настройки запросов
REQUEST_LIMIT=1000
REQUEST_DELAY_MS=300
MAX_RETRIES=5
RETRY_BACKOFF_MS=2000
```

Сохраните: `Ctrl+X`, затем `Y`, затем `Enter`.

### Параметры конфигурации

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `OZON_CLIENT_ID` | Client-Id из личного кабинета Ozon | - |
| `OZON_API_KEY` | Api-Key из личного кабинета Ozon | - |
| `OZON_API_URL` | Базовый URL API | `https://api-seller.ozon.ru` |
| `REQUEST_LIMIT` | Записей на страницу (макс. 1000) | `1000` |
| `REQUEST_DELAY_MS` | Задержка между запросами | `300` |
| `MAX_RETRIES` | Макс. повторов при ошибке | `5` |
| `RETRY_BACKOFF_MS` | Базовая задержка для backoff | `2000` |

### Где найти Client-Id и Api-Key

1. Войдите в личный кабинет Ozon Seller: https://seller.ozon.ru/
2. Перейдите: **Настройки** → **API ключи**
3. Создайте новый ключ или скопируйте существующий
4. `Client-Id` — числовой идентификатор продавца
5. `Api-Key` — строка в формате UUID

---

## Шаг 6: Создание таблиц в БД

### Способ 1: Через npm скрипт
```bash
cd /opt/uploading_ozon_balances_to_the_database
npm run init-db
```

### Способ 2: Через psql
```bash
apt update && apt install -y postgresql-client
psql -h 176.124.219.60 -U gen_user -d default_db -f /opt/uploading_ozon_balances_to_the_database/sql/init.sql
# Введите пароль: y>D4~;f^YLgFA|
```

### Способ 3: Подключиться и выполнить вручную
```bash
psql -h 176.124.219.60 -U gen_user -d default_db
# Введите пароль

# В psql:
\i /opt/uploading_ozon_balances_to_the_database/sql/init.sql

# Проверьте создание таблиц:
\dt

# Должны появиться:
#  ozon_fbo_stocks
#  ozon_products
#  ozon_stock_sync_log

\q
```

### Структура таблиц

| Таблица | Назначение |
|---------|------------|
| `ozon_fbo_stocks` | Остатки товаров на складах Ozon (FBO) |
| `ozon_products` | Справочник товаров продавца |
| `ozon_stock_sync_log` | Логи выполнения синхронизации |

---

## Шаг 7: Тестовый запуск

```bash
cd /opt/uploading_ozon_balances_to_the_database
node src/app.js
```

### Ожидаемый вывод:

```
============================================================
Ozon FBO Stocks Sync started at 2025-02-03T12:00:00.000Z
============================================================
Database initialized
Fetching products list...
Fetched 500 products...
Total products: 1234
Fetching product details and saving...
Processed 500 product details...
Products with SKU: 1100
Fetching FBO stocks...
Processed 500 stock records...
Sync completed: 850 stock records (800 new, 50 updated)
============================================================
Summary:
  Products fetched: 1234
  Stock records: 850
  New records: 800
  Updated records: 50
  HTTP requests: 25
  Retries: 0
============================================================
```

---

## Шаг 8: Настройка Cron (каждые 30 минут)

```bash
crontab -e
```

Добавьте строку:
```cron
*/30 * * * * cd /opt/uploading_ozon_balances_to_the_database && /usr/bin/node src/app.js >> /var/log/uploading_ozon_balances_to_the_database.log 2>&1
```

Сохраните: `Ctrl+X`, затем `Y`, затем `Enter`.

### Проверка cron:
```bash
crontab -l
```

### Создание файла лога:
```bash
touch /var/log/uploading_ozon_balances_to_the_database.log
chmod 644 /var/log/uploading_ozon_balances_to_the_database.log
```

---

## Шаг 9: Проверка работы

### Просмотр логов в реальном времени:
```bash
tail -f /var/log/uploading_ozon_balances_to_the_database.log
```

### Проверка данных в БД:
```bash
psql -h 176.124.219.60 -U gen_user -d default_db
# Введите пароль: y>D4~;f^YLgFA|
```

```sql
-- Количество записей остатков FBO
SELECT COUNT(*) FROM ozon_fbo_stocks;

-- Количество товаров
SELECT COUNT(*) FROM ozon_products;

-- Остатки по складам
SELECT 
    warehouse_name,
    COUNT(*) as products,
    SUM(free_to_sell_amount) as total_available,
    SUM(reserved_amount) as total_reserved,
    SUM(promised_amount) as total_promised
FROM ozon_fbo_stocks
GROUP BY warehouse_name
ORDER BY total_available DESC;

-- Последние обновлённые записи
SELECT 
    sku, offer_id, product_name, warehouse_name,
    free_to_sell_amount, reserved_amount, promised_amount,
    updated_at
FROM ozon_fbo_stocks
ORDER BY updated_at DESC
LIMIT 20;

-- Товары с нулевыми остатками
SELECT 
    sku, offer_id, product_name, warehouse_name
FROM ozon_fbo_stocks
WHERE free_to_sell_amount = 0
LIMIT 20;

-- Топ-10 товаров по количеству на складах
SELECT 
    sku, offer_id, product_name,
    SUM(free_to_sell_amount) as total_available
FROM ozon_fbo_stocks
GROUP BY sku, offer_id, product_name
ORDER BY total_available DESC
LIMIT 10;

-- Справочник товаров
SELECT 
    product_id, offer_id, sku, name, visible
FROM ozon_products
ORDER BY synced_at DESC
LIMIT 20;

-- Логи синхронизации
SELECT 
    job_start, job_end, status,
    products_fetched, stocks_fetched,
    stocks_inserted, stocks_updated,
    http_requests, retries,
    EXTRACT(EPOCH FROM (job_end - job_start))::int AS duration_sec
FROM ozon_stock_sync_log
ORDER BY job_start DESC
LIMIT 10;

-- Ошибки синхронизации
SELECT job_start, status, error_message
FROM ozon_stock_sync_log
WHERE status = 'failed'
ORDER BY job_start DESC
LIMIT 5;
```

---

## Структура проекта

```
uploading_ozon_balances_to_the_database/
├── src/
│   ├── app.js                # Точка входа
│   ├── config.js             # Конфигурация из .env
│   ├── database.js           # Подключение к PostgreSQL
│   ├── api/
│   │   └── ozon.js           # Ozon Seller API
│   ├── services/
│   │   └── syncStocks.js     # Логика синхронизации
│   └── utils/
│       └── logger.js         # Логирование
├── sql/
│   └── init.sql              # SQL для создания таблиц
├── .env                      # Конфигурация (НЕ коммитить!)
├── .gitignore
├── package.json
└── deploy.md                 # Эта инструкция
```

---

## Устранение неполадок

### Ошибка подключения к БД

1. Проверьте доступность PostgreSQL:
   ```bash
   nc -zv 176.124.219.60 5432
   ```

2. Проверьте данные в `.env`

3. Тест подключения:
   ```bash
   psql -h 176.124.219.60 -U gen_user -d default_db -c "SELECT 1;"
   ```

### Ошибка API (401 Unauthorized)

1. Проверьте `OZON_CLIENT_ID` и `OZON_API_KEY` в `.env`
2. Убедитесь, что ключ активен в личном кабинете Ozon
3. Проверьте, что Client-Id — это числовой ID, а Api-Key — UUID

### Ошибка API (403 Forbidden)

1. Проверьте права доступа API ключа
2. Убедитесь, что ключ имеет доступ к методам аналитики

### Ошибка API (429 Too Many Requests)

Скрипт автоматически обрабатывает rate limiting с экспоненциальным backoff.
Если ошибка повторяется:
1. Увеличьте `REQUEST_DELAY_MS` в `.env` до 500-1000
2. Уменьшите `REQUEST_LIMIT` до 500

### Ошибка API (5xx Server Error)

Скрипт автоматически делает до 5 повторов с увеличивающейся задержкой.
Если проблема сохраняется — проверьте статус Ozon API.

### Cron не работает

1. Проверьте статус cron:
   ```bash
   systemctl status cron
   ```

2. Проверьте логи:
   ```bash
   grep CRON /var/log/syslog
   ```

3. Перезапустите cron:
   ```bash
   systemctl restart cron
   ```

4. Проверьте путь к node:
   ```bash
   which node
   # Должно быть: /usr/bin/node
   ```

### Нет данных FBO

1. Убедитесь, что у вас есть товары на складах Ozon (FBO)
2. Проверьте, что товары видны в личном кабинете Ozon
3. Скрипт фильтрует только `warehouse_type: "fbo"`, товары FBS не выгружаются

---

## Полезные команды

```bash
# Ручной запуск
cd /opt/uploading_ozon_balances_to_the_database && node src/app.js

# Просмотр последних логов
tail -100 /var/log/uploading_ozon_balances_to_the_database.log

# Статистика синхронизаций
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT status, COUNT(*), 
          AVG(EXTRACT(EPOCH FROM (job_end - job_start)))::int as avg_sec,
          SUM(stocks_fetched) as total_stocks
   FROM ozon_stock_sync_log GROUP BY status;"

# Очистка старых логов (старше 30 дней)
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "DELETE FROM ozon_stock_sync_log WHERE job_start < NOW() - INTERVAL '30 days';"

# Количество записей по таблицам
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT 'ozon_fbo_stocks' as table_name, COUNT(*) FROM ozon_fbo_stocks
   UNION ALL SELECT 'ozon_products', COUNT(*) FROM ozon_products
   UNION ALL SELECT 'ozon_stock_sync_log', COUNT(*) FROM ozon_stock_sync_log;"

# Остатки по всем складам (сводка)
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT warehouse_name, 
          COUNT(DISTINCT sku) as unique_skus,
          SUM(free_to_sell_amount) as total_available
   FROM ozon_fbo_stocks
   GROUP BY warehouse_name
   ORDER BY total_available DESC;"

# Товары с низкими остатками (менее 10 шт)
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT sku, offer_id, product_name, 
          SUM(free_to_sell_amount) as total_available
   FROM ozon_fbo_stocks
   GROUP BY sku, offer_id, product_name
   HAVING SUM(free_to_sell_amount) < 10 AND SUM(free_to_sell_amount) > 0
   ORDER BY total_available
   LIMIT 20;"
```

---

## Мониторинг

### Проверка последней успешной синхронизации
```bash
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT job_start, job_end, stocks_fetched, stocks_inserted, stocks_updated
   FROM ozon_stock_sync_log WHERE status = 'success'
   ORDER BY job_start DESC LIMIT 1;"
```

### Алерт если синхронизация не работает более 1 часа
```bash
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT CASE 
     WHEN MAX(job_start) < NOW() - INTERVAL '1 hour' THEN 'ALERT: No sync in last hour!'
     ELSE 'OK: Last sync at ' || MAX(job_start)::text
   END FROM ozon_stock_sync_log WHERE status = 'success';"
```

---
