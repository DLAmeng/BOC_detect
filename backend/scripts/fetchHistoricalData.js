import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { DEFAULT_HISTORY_CURRENCY_MAP, refreshYahooHistory } from '../lib/yahooHistory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const CURRENCY_MAP = DEFAULT_HISTORY_CURRENCY_MAP;

const ensureDataDirectory = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
};

async function run() {
  await ensureDataDirectory();
  await refreshYahooHistory({
    dataDir: DATA_DIR,
    currencyMap: CURRENCY_MAP,
    sleepMs: 2000,
    logger: console,
  });

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
