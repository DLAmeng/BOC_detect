import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const currencyFilePath = (code) => path.join(DATA_DIR, `rates-${code}.ndjson`);

const CURRENCY_MAP = {
  AUD: '澳大利亚元',
  USD: '美元',
  EUR: '欧元',
  GBP: '英镑',
  JPY: '日元',
  HKD: '港币',
};

const ensureDataDirectory = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
};

// Sleep utility to avoid hammering APIs
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDateTime = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Fetch 1-year historical data from Yahoo Finance for a specific currency
 */
async function fetchYahooHistory(currencyCode) {
  const symbol = `${currencyCode}CNY=X`;
  // range=1y grabs 1 year of data, interval=1d gives daily closes
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=US&lang=en-US&includePrePost=false&interval=1d&useYfid=true&range=1y&corsDomain=finance.yahoo.com&.tsrc=finance`;

  console.log(`[History Fetcher] Requesting 1-year data for ${currencyCode} from Yahoo...`);
  
  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
  });

  const result = response.data?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
    throw new Error(`Invalid data structure from Yahoo for ${currencyCode}`);
  }

  const timestamps = result.timestamp;
  const closes = result.indicators.quote[0].close;

  const records = [];
  const currencyName = CURRENCY_MAP[currencyCode];

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i] * 1000; // Yahoo returns seconds, convert to ms
    const closePrice = closes[i];

    // Some days might not have trading data (null)
    if (closePrice == null) continue;

    const dateObj = new Date(ts);
    
    // BOC format mock up
    const calculatedRate = Number(closePrice.toFixed(4));
    const rawSellingRate = Number((calculatedRate * 100).toFixed(2));

    records.push({
      currency: currencyCode,
      currencyName,
      rawSellingRate,
      calculatedRate,
      pubTime: formatDateTime(dateObj),
      fetchTime: formatDateTime(dateObj), // use same for history
      fetchTimestampMs: ts,
      source: 'Yahoo Finance (Historical)',
    });
  }

  return records;
}

async function mergeAndSaveHistory(currencyCode, newRecords) {
  const filePath = currencyFilePath(currencyCode);
  let existingRecords = [];

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    existingRecords = raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[History Fetcher] Error reading existing file for ${currencyCode}:`, error);
    }
  }

  console.log(`[History Fetcher] ${currencyCode}: Found ${existingRecords.length} existing records. Fetched ${newRecords.length} historical records.`);

  // Combine and deduplicate by fetchTimestampMs
  // We'll prioritize existing precise records if they happen to overlap exactly, 
  // but generally Yahoo gives daily closes so they won't perfectly overlap with real-time fetch exact ms.
  // Using a map keyed by day string to replace daily data, but append live data.
  // Actually, easiest is just to merge, sort by timestamp, and save.
  const allRecordsMap = new Map();
  
  // Insert historical first
  for (const r of newRecords) {
    allRecordsMap.set(r.fetchTimestampMs, r);
  }
  
  // Existing overwrites/appends on top
  for (const r of existingRecords) {
    allRecordsMap.set(r.fetchTimestampMs, r);
  }

  const merged = Array.from(allRecordsMap.values()).sort((a, b) => a.fetchTimestampMs - b.fetchTimestampMs);

  console.log(`[History Fetcher] ${currencyCode}: Merged into ${merged.length} total records. Saving...`);

  const payload = merged.length ? `${merged.map((r) => JSON.stringify(r)).join('\n')}\n` : '';
  await fs.writeFile(filePath, payload, 'utf8');
}

async function run() {
  await ensureDataDirectory();
  const currencies = Object.keys(CURRENCY_MAP);

  console.log('=================================================');
  console.log('Starting Historical Data Backfill (Past 1 Year)');
  console.log('Target Currencies:', currencies.join(', '));
  console.log('=================================================\n');

  for (const code of currencies) {
    try {
      const historyRecords = await fetchYahooHistory(code);
      await mergeAndSaveHistory(code, historyRecords);
      console.log(`[History Fetcher] Successfully processed ${code}.\n`);
    } catch (error) {
      console.error(`[History Fetcher] Failed to process ${code}:`, error.message);
    }
    // sleep to prevent rate limiting
    await sleep(2000);
  }

  console.log('Done!');

  // Notify backend to reload history cache
  try {
    const port = process.env.PORT || process.env.API_BACKEND_PORT || 3001;
    await axios.post(`http://127.0.0.1:${port}/api/history/reload`);
    console.log('[History Fetcher] Notified backend to reload history cache.');
  } catch (error) {
    console.log('[History Fetcher] Note: Could not notify backend to reload cache (is it running?). You may need to restart the backend to see historical data.');
  }
}

run();
