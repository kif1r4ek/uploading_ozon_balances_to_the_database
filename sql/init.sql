CREATE TABLE IF NOT EXISTS ozon_fbo_stocks (
    id SERIAL PRIMARY KEY,
    sku BIGINT NOT NULL,
    product_id BIGINT,
    offer_id VARCHAR(255),
    product_name VARCHAR(500),
    warehouse_id BIGINT NOT NULL,
    warehouse_name VARCHAR(255),
    item_code VARCHAR(255),
    free_to_sell_amount INTEGER DEFAULT 0,
    promised_amount INTEGER DEFAULT 0,
    reserved_amount INTEGER DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sku, warehouse_id)
);

CREATE TABLE IF NOT EXISTS ozon_products (
    id SERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL UNIQUE,
    offer_id VARCHAR(255),
    sku BIGINT,
    name VARCHAR(500),
    barcode VARCHAR(255),
    category_id BIGINT,
    created_at TIMESTAMPTZ,
    visible BOOLEAN DEFAULT TRUE,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ozon_stock_sync_log (
    id SERIAL PRIMARY KEY,
    job_start TIMESTAMPTZ NOT NULL,
    job_end TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'running',
    products_fetched INTEGER DEFAULT 0,
    stocks_fetched INTEGER DEFAULT 0,
    stocks_inserted INTEGER DEFAULT 0,
    stocks_updated INTEGER DEFAULT 0,
    http_requests INTEGER DEFAULT 0,
    retries INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);