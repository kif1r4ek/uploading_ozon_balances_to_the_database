import pg from 'pg';
import { config } from './config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: 10,
  idleTimeoutMillis: 30000
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}

export async function initDatabase() {
  const sqlPath = join(__dirname, '..', 'sql', 'init.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Database initialized');
}

export async function upsertProduct(product) {
  const sql = `
    INSERT INTO ozon_products (product_id, offer_id, sku, name, barcode, category_id, created_at, visible, synced_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (product_id) DO UPDATE SET
      offer_id = EXCLUDED.offer_id,
      sku = EXCLUDED.sku,
      name = EXCLUDED.name,
      barcode = EXCLUDED.barcode,
      category_id = EXCLUDED.category_id,
      visible = EXCLUDED.visible,
      synced_at = NOW()
  `;
  
  await query(sql, [
    product.productId,
    product.offerId,
    product.sku,
    product.name,
    product.barcode,
    product.categoryId,
    product.createdAt,
    product.visible
  ]);
}

export async function upsertStock(stock) {
  const sql = `
    INSERT INTO ozon_fbo_stocks (
      sku, product_id, offer_id, product_name, warehouse_id, warehouse_name,
      item_code, free_to_sell_amount, promised_amount, reserved_amount, synced_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
    ON CONFLICT (sku, warehouse_id) DO UPDATE SET
      product_id = EXCLUDED.product_id,
      offer_id = EXCLUDED.offer_id,
      product_name = EXCLUDED.product_name,
      warehouse_name = EXCLUDED.warehouse_name,
      item_code = EXCLUDED.item_code,
      free_to_sell_amount = EXCLUDED.free_to_sell_amount,
      promised_amount = EXCLUDED.promised_amount,
      reserved_amount = EXCLUDED.reserved_amount,
      updated_at = NOW()
    RETURNING (xmax = 0) AS inserted
  `;
  
  const result = await query(sql, [
    stock.sku,
    stock.productId,
    stock.offerId,
    stock.productName,
    stock.warehouseId,
    stock.warehouseName,
    stock.itemCode,
    stock.freeToSellAmount,
    stock.promisedAmount,
    stock.reservedAmount
  ]);
  
  return result.rows[0]?.inserted;
}

export async function createSyncLog(jobStart) {
  const result = await query(
    `INSERT INTO ozon_stock_sync_log (job_start, status) VALUES ($1, 'running') RETURNING id`,
    [jobStart]
  );
  return result.rows[0].id;
}

export async function updateSyncLog(logId, data) {
  const fields = [];
  const params = [logId];
  let idx = 2;
  
  const fieldMap = {
    jobEnd: 'job_end',
    status: 'status',
    productsFetched: 'products_fetched',
    stocksFetched: 'stocks_fetched',
    stocksInserted: 'stocks_inserted',
    stocksUpdated: 'stocks_updated',
    httpRequests: 'http_requests',
    retries: 'retries',
    errorMessage: 'error_message'
  };
  
  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      fields.push(`${dbField} = $${idx++}`);
      params.push(data[key]);
    }
  }
  
  if (fields.length) {
    await query(`UPDATE ozon_stock_sync_log SET ${fields.join(', ')} WHERE id = $1`, params);
  }
}

export async function closePool() {
  await pool.end();
}
