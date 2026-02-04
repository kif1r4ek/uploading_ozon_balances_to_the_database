import { syncStocks } from './services/syncStocks.js';
import { initDatabase, closePool } from './database.js';

async function main() {
  console.log('='.repeat(60));
  console.log(`Ozon FBO Stocks Sync started at ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  
  try {
    await initDatabase();
    const result = await syncStocks();
    
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  Products fetched: ${result.productsFetched}`);
    console.log(`  Stock records: ${result.stocksFetched}`);
    console.log(`  New records: ${result.stocksInserted}`);
    console.log(`  Updated records: ${result.stocksUpdated}`);
    console.log(`  HTTP requests: ${result.httpRequests}`);
    console.log(`  Retries: ${result.retries}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
