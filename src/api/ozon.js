import { config } from '../config.js';

const { clientId, apiKey, apiUrl } = config.ozon;
const { limit, delayMs, maxRetries, retryBackoffMs } = config.request;

let httpRequestCount = 0;
let retryCount = 0;

export function getStats() {
  return { httpRequestCount, retryCount };
}

export function resetStats() {
  httpRequestCount = 0;
  retryCount = 0;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiRequest(endpoint, body, attempt = 1) {
  httpRequestCount++;
  
  try {
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-Id': clientId,
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (response.status === 429 || response.status >= 500) {
      if (attempt <= maxRetries) {
        retryCount++;
        const waitTime = retryBackoffMs * Math.pow(2, attempt - 1);
        console.log(`Retry ${attempt}/${maxRetries} after ${waitTime}ms (HTTP ${response.status})`);
        await sleep(waitTime);
        return apiRequest(endpoint, body, attempt + 1);
      }
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return response.json();
  } catch (error) {
    if (attempt <= maxRetries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      retryCount++;
      const waitTime = retryBackoffMs * Math.pow(2, attempt - 1);
      console.log(`Retry ${attempt}/${maxRetries} after ${waitTime}ms (${error.code})`);
      await sleep(waitTime);
      return apiRequest(endpoint, body, attempt + 1);
    }
    throw error;
  }
}

export async function* fetchAllProducts() {
  let lastId = '';
  
  while (true) {
    const body = {
      filter: { visibility: 'ALL' },
      limit,
      last_id: lastId
    };
    
    const data = await apiRequest('/v3/product/list', body);
    const items = data.result?.items || [];
    
    if (!items.length) break;
    
    for (const item of items) {
      yield {
        productId: item.product_id,
        offerId: item.offer_id,
        sku: item.sku || null,
        archived: item.archived,
        visible: !item.archived
      };
    }
    
    lastId = data.result?.last_id || '';
    if (!lastId || items.length < limit) break;
    
    await sleep(delayMs);
  }
}

export async function fetchProductInfo(productIds) {
  if (!productIds.length) return [];

  const body = { product_id: productIds };
  const data = await apiRequest('/v3/product/info/list', body);

  return (data.items || []).map(item => ({
    productId: item.id,
    offerId: item.offer_id,
    sku: item.sku,
    name: item.name,
    barcode: item.barcode,
    categoryId: item.description_category_id,
    createdAt: item.created_at,
    visible: item.visible
  }));
}

export async function fetchStocksOnWarehouses(skus) {
  if (!skus.length) return [];

  const body = { skus };
  const data = await apiRequest('/v1/analytics/stocks', body);

  const stocks = [];
  const items = data.items || [];

  for (const item of items) {
    stocks.push({
      sku: item.sku,
      productId: null,
      offerId: item.offer_id,
      productName: item.name,
      warehouseId: item.cluster_id,
      warehouseName: item.cluster_name,
      itemCode: null,
      freeToSellAmount: item.available_stock_count || 0,
      promisedAmount: item.transit_stock_count || 0,
      reservedAmount: item.requested_stock_count || 0
    });
  }

  return stocks;
}

export async function* fetchAllFboStocks(skus) {
  if (!skus || !skus.length) return;

  const batchSize = Math.min(limit, 100);

  for (let i = 0; i < skus.length; i += batchSize) {
    const batch = skus.slice(i, i + batchSize);
    const body = { skus: batch };
    const data = await apiRequest('/v1/analytics/stocks', body);

    const items = data.items || [];

    for (const item of items) {
      yield {
        sku: item.sku,
        productId: null,
        offerId: item.offer_id,
        productName: item.name,
        warehouseId: item.cluster_id,
        warehouseName: item.cluster_name,
        itemCode: null,
        freeToSellAmount: item.available_stock_count || 0,
        promisedAmount: item.transit_stock_count || 0,
        reservedAmount: item.requested_stock_count || 0
      };
    }

    if (i + batchSize < skus.length) {
      await sleep(delayMs);
    }
  }
}
