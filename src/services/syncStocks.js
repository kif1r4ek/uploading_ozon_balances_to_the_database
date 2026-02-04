import * as api from '../api/ozon.js';
import * as db from '../database.js';

const BATCH_SIZE = 100;

export async function syncStocks() {
  const jobStart = new Date();
  const logId = await db.createSyncLog(jobStart);
  
  api.resetStats();
  
  let productsFetched = 0;
  let stocksFetched = 0;
  let stocksInserted = 0;
  let stocksUpdated = 0;
  
  try {
    console.log('Fetching products list...');
    const productIds = [];
    const productSkus = [];
    
    for await (const product of api.fetchAllProducts()) {
      productsFetched++;
      productIds.push(product.productId);
      
      if (productsFetched % 500 === 0) {
        console.log(`Fetched ${productsFetched} products...`);
      }
    }
    
    console.log(`Total products: ${productsFetched}`);
    
    console.log('Fetching product details and saving...');
    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
      const batch = productIds.slice(i, i + BATCH_SIZE);
      const products = await api.fetchProductInfo(batch);
      
      for (const product of products) {
        await db.upsertProduct(product);
        if (product.sku) {
          productSkus.push(product.sku);
        }
      }
      
      if (i % 500 === 0 && i > 0) {
        console.log(`Processed ${i} product details...`);
      }
    }
    
    console.log(`Products with SKU: ${productSkus.length}`);
    
    console.log('Fetching FBO stocks...');

    for await (const stock of api.fetchAllFboStocks(productSkus)) {
      stocksFetched++;
      
      const isNew = await db.upsertStock(stock);
      if (isNew) {
        stocksInserted++;
      } else {
        stocksUpdated++;
      }
      
      if (stocksFetched % 500 === 0) {
        console.log(`Processed ${stocksFetched} stock records...`);
      }
    }
    
    const stats = api.getStats();
    
    await db.updateSyncLog(logId, {
      jobEnd: new Date(),
      status: 'success',
      productsFetched,
      stocksFetched,
      stocksInserted,
      stocksUpdated,
      httpRequests: stats.httpRequestCount,
      retries: stats.retryCount
    });
    
    console.log(`Sync completed: ${stocksFetched} stock records (${stocksInserted} new, ${stocksUpdated} updated)`);
    
    return {
      productsFetched,
      stocksFetched,
      stocksInserted,
      stocksUpdated,
      httpRequests: stats.httpRequestCount,
      retries: stats.retryCount
    };
    
  } catch (error) {
    console.error('Sync failed:', error.message);
    
    const stats = api.getStats();
    await db.updateSyncLog(logId, {
      jobEnd: new Date(),
      status: 'failed',
      productsFetched,
      stocksFetched,
      stocksInserted,
      stocksUpdated,
      httpRequests: stats.httpRequestCount,
      retries: stats.retryCount,
      errorMessage: error.message
    });
    
    throw error;
  }
}
