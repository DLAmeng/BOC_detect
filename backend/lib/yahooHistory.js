import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';

export const DEFAULT_HISTORY_CURRENCY_MAP = {
  AUD: '澳大利亚元',
  USD: '美元',
  EUR: '欧元',
  GBP: '英镑',
  JPY: '日元',
  HKD: '港币',
};

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

const currencyFilePath = (dataDir, code) => path.join(dataDir, `rates-${code}.ndjson`);

export const fetchYahooHistory = async (
  currencyCode,
  {
    currencyMap = DEFAULT_HISTORY_CURRENCY_MAP,
    timeoutMs = 15000,
  } = {}
) => {
  const currencyName = currencyMap[currencyCode];
  if (!currencyName) {
    throw new Error(`Unsupported currency: ${currencyCode}`);
  }

  const symbol = `${currencyCode}CNY=X`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=US&lang=en-US&includePrePost=false&interval=1d&useYfid=true&range=1y&corsDomain=finance.yahoo.com&.tsrc=finance`;

  const response = await axios.get(url, {
    timeout: timeoutMs,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  const result = response.data?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
    throw new Error(`Invalid data structure from Yahoo for ${currencyCode}`);
  }

  const timestamps = result.timestamp;
  const closes = result.indicators.quote[0].close;
  const records = [];

  for (let i = 0; i < timestamps.length; i += 1) {
    const closePrice = closes[i];
    if (closePrice == null) continue;

    const ts = timestamps[i] * 1000;
    const dateObj = new Date(ts);
    const calculatedRate = Number(closePrice.toFixed(4));
    const rawSellingRate = Number((calculatedRate * 100).toFixed(2));

    records.push({
      currency: currencyCode,
      currencyName,
      rawSellingRate,
      calculatedRate,
      pubTime: formatDateTime(dateObj),
      fetchTime: formatDateTime(dateObj),
      fetchTimestampMs: ts,
      source: 'Yahoo Finance (Historical)',
    });
  }

  return records;
};

export const mergeAndSaveHistory = async (
  currencyCode,
  newRecords,
  {
    dataDir,
  }
) => {
  if (!dataDir) {
    throw new Error('dataDir is required');
  }

  const filePath = currencyFilePath(dataDir, currencyCode);
  let existingRecords = [];

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    existingRecords = raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const allRecordsMap = new Map();

  for (const record of newRecords) {
    allRecordsMap.set(record.fetchTimestampMs, record);
  }

  for (const record of existingRecords) {
    allRecordsMap.set(record.fetchTimestampMs, record);
  }

  const merged = Array.from(allRecordsMap.values()).sort((a, b) => a.fetchTimestampMs - b.fetchTimestampMs);
  const payload = merged.length ? `${merged.map((record) => JSON.stringify(record)).join('\n')}\n` : '';

  await fs.writeFile(filePath, payload, 'utf8');

  return {
    existingCount: existingRecords.length,
    fetchedCount: newRecords.length,
    totalCount: merged.length,
  };
};

export const refreshYahooHistory = async ({
  dataDir,
  currencyMap = DEFAULT_HISTORY_CURRENCY_MAP,
  currencies = Object.keys(currencyMap),
  timeoutMs = 15000,
  sleepMs = 2000,
  logger = console,
} = {}) => {
  if (!dataDir) {
    throw new Error('dataDir is required');
  }

  await fs.mkdir(dataDir, { recursive: true });

  logger.log?.('=================================================');
  logger.log?.('Starting Yahoo Historical Data Refresh');
  logger.log?.('Target Currencies:', currencies.join(', '));
  logger.log?.('=================================================');

  const results = [];

  for (const code of currencies) {
    try {
      logger.log?.(`[History Fetcher] Requesting 1-year data for ${code} from Yahoo...`);
      const historyRecords = await fetchYahooHistory(code, {
        currencyMap,
        timeoutMs,
      });
      const mergeSummary = await mergeAndSaveHistory(code, historyRecords, { dataDir });

      logger.log?.(
        `[History Fetcher] ${code}: existing=${mergeSummary.existingCount}, fetched=${mergeSummary.fetchedCount}, total=${mergeSummary.totalCount}`
      );

      results.push({
        currency: code,
        success: true,
        ...mergeSummary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error?.(`[History Fetcher] Failed to process ${code}:`, message);
      results.push({
        currency: code,
        success: false,
        error: message,
      });
    }

    if (sleepMs > 0) {
      await sleep(sleepMs);
    }
  }

  const successCount = results.filter((item) => item.success).length;
  const failureCount = results.length - successCount;

  logger.log?.(
    `[History Fetcher] Yahoo history refresh finished. Success=${successCount}, Failed=${failureCount}`
  );

  return {
    results,
    successCount,
    failureCount,
  };
};
