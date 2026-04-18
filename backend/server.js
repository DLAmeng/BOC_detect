import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || process.env.API_BACKEND_PORT || 3001);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 10000);
const BOC_SOURCE_URL = process.env.BOC_SOURCE_URL || 'https://www.boc.cn/sourcedb/whpj/';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const LEGACY_HISTORY_FILE = path.join(DATA_DIR, 'rates-history.json');
const MAX_HISTORY_PER_CURRENCY = Number(process.env.MAX_HISTORY_PER_CURRENCY || 100000);
const DEFAULT_HISTORY_LIMIT = Number(process.env.DEFAULT_HISTORY_LIMIT || 2000);

const currencyFilePath = (code) => path.join(DATA_DIR, `rates-${code}.ndjson`);
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').trim();
const rawCorsOrigin = process.env.CORS_ORIGIN || '*';

const corsOrigin =
  rawCorsOrigin === '*'
    ? true
    : rawCorsOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '256kb' }));

const CURRENCY_MAP = {
  AUD: '澳大利亚元',
  USD: '美元',
  EUR: '欧元',
  GBP: '英镑',
  JPY: '日元',
  HKD: '港币',
};

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

let historyStore = null;
let historyLoadPromise = null;
const writeQueues = new Map();

const formatDateTime = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const parsePositiveInteger = (value, fallbackValue) => {
  const parsedValue = Number.parseInt(`${value}`, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
};

const ensureDataDirectory = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
};

const enqueueWrite = (currencyCode, task) => {
  const previous = writeQueues.get(currencyCode) || Promise.resolve();
  const next = previous.then(task, task);
  writeQueues.set(
    currencyCode,
    next.catch((error) => {
      console.error(`[BOC Backend] Write task for ${currencyCode} failed:`, error);
    })
  );
  return next;
};

const appendRecord = (currencyCode, record) =>
  enqueueWrite(currencyCode, () =>
    fs.appendFile(currencyFilePath(currencyCode), `${JSON.stringify(record)}\n`, 'utf8')
  );

const compactCurrencyFile = (currencyCode, records) =>
  enqueueWrite(currencyCode, () => {
    const payload = records.length ? `${records.map((r) => JSON.stringify(r)).join('\n')}\n` : '';
    return fs.writeFile(currencyFilePath(currencyCode), payload, 'utf8');
  });

const loadCurrencyNdjson = async (currencyCode) => {
  try {
    const raw = await fs.readFile(currencyFilePath(currencyCode), 'utf8');
    if (!raw.trim()) return [];
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
};

const migrateLegacyIfNeeded = async () => {
  try {
    const raw = await fs.readFile(LEGACY_HISTORY_FILE, 'utf8');
    const legacy = raw.trim() ? JSON.parse(raw) : {};
    for (const [currency, records] of Object.entries(legacy)) {
      if (!Array.isArray(records) || records.length === 0) continue;
      const trimmed = records.slice(-MAX_HISTORY_PER_CURRENCY);
      const payload = `${trimmed.map((r) => JSON.stringify(r)).join('\n')}\n`;
      await fs.writeFile(currencyFilePath(currency), payload, 'utf8');
    }
    await fs.rename(LEGACY_HISTORY_FILE, `${LEGACY_HISTORY_FILE}.bak`);
    console.log('[BOC Backend] Migrated legacy rates-history.json to per-currency NDJSON files.');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('[BOC Backend] Legacy migration failed:', error);
    }
  }
};

const loadHistoryStore = async () => {
  if (historyStore) return historyStore;

  if (!historyLoadPromise) {
    historyLoadPromise = (async () => {
      await ensureDataDirectory();
      await migrateLegacyIfNeeded();

      const store = {};
      for (const code of Object.keys(CURRENCY_MAP)) {
        const records = await loadCurrencyNdjson(code);
        if (records.length > MAX_HISTORY_PER_CURRENCY) {
          store[code] = records.slice(-MAX_HISTORY_PER_CURRENCY);
          await compactCurrencyFile(code, store[code]);
        } else {
          store[code] = records;
        }
      }

      historyStore = store;
      return historyStore;
    })();
  }

  return historyLoadPromise;
};

const findCurrencyRow = ($, currencyName) => {
  let matchedRow = null;

  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 8) {
      return;
    }

    const name = $(cells[0]).text().trim();
    if (name === currencyName) {
      matchedRow = cells;
    }
  });

  return matchedRow;
};

const fetchRateRecord = async (currencyCode) => {
  const currencyName = CURRENCY_MAP[currencyCode];

  if (!currencyName) {
    const error = new Error('不支持的币种');
    error.statusCode = 400;
    throw error;
  }

  const response = await axios.get(BOC_SOURCE_URL, {
    headers: REQUEST_HEADERS,
    responseType: 'text',
    timeout: REQUEST_TIMEOUT_MS,
  });

  const $ = cheerio.load(response.data);
  const row = findCurrencyRow($, currencyName);

  if (!row) {
    const error = new Error(`未在中国银行页面上找到 ${currencyName} 的数据`);
    error.statusCode = 404;
    throw error;
  }

  const rawSellingRate = Number.parseFloat($(row[3]).text().trim());
  const pubDate = $(row[6]).text().trim();
  const pubTime = $(row[7]).text().trim();
  const publicationTime = pubDate.includes(':') ? pubDate : `${pubDate} ${pubTime}`.trim();
  const fetchTime = formatDateTime();
  const fetchTimestampMs = Date.now();

  if (!Number.isFinite(rawSellingRate) || !publicationTime) {
    const error = new Error(`已找到 ${currencyName}，但页面结构异常，无法解析汇率`);
    error.statusCode = 502;
    throw error;
  }

  return {
    currency: currencyCode,
    currencyName,
    rawSellingRate,
    calculatedRate: Number((rawSellingRate / 100).toFixed(4)),
    pubTime: publicationTime,
    fetchTime,
    fetchTimestampMs,
    source: BOC_SOURCE_URL,
  };
};

const recordRateHistory = async (rateRecord) => {
  const store = await loadHistoryStore();
  const currentHistory = store[rateRecord.currency] || (store[rateRecord.currency] = []);
  const lastRecord = currentHistory[currentHistory.length - 1];

  if (
    lastRecord &&
    lastRecord.pubTime === rateRecord.pubTime &&
    lastRecord.rawSellingRate === rateRecord.rawSellingRate
  ) {
    return false;
  }

  currentHistory.push(rateRecord);

  if (currentHistory.length > MAX_HISTORY_PER_CURRENCY) {
    currentHistory.splice(0, currentHistory.length - MAX_HISTORY_PER_CURRENCY);
    await compactCurrencyFile(rateRecord.currency, currentHistory);
  } else {
    await appendRecord(rateRecord.currency, rateRecord);
  }

  return true;
};

const sendTelegramMessages = async ({ botToken, chatId, messages }) => {
  let sentCount = 0;

  for (const text of messages) {
    await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      },
      {
        timeout: REQUEST_TIMEOUT_MS,
      }
    );
    sentCount += 1;
  }

  return sentCount;
};

app.get('/api/health', async (_req, res) => {
  await loadHistoryStore();
  res.json({
    status: 'ok',
    service: 'boc-monitor-backend',
    source: BOC_SOURCE_URL,
    dataDir: DATA_DIR,
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    timestamp: formatDateTime(),
  });
});

app.get('/api/history', async (req, res) => {
  const currencyCode = `${req.query.currency || 'AUD'}`.toUpperCase();
  const currencyName = CURRENCY_MAP[currencyCode];

  if (!currencyName) {
    return res.status(400).json({
      error: '不支持的币种',
      supportedCurrencies: Object.keys(CURRENCY_MAP),
    });
  }

  const limit = Math.min(
    parsePositiveInteger(req.query.limit, DEFAULT_HISTORY_LIMIT),
    MAX_HISTORY_PER_CURRENCY
  );

  const store = await loadHistoryStore();
  const items = (store[currencyCode] || []).slice(-limit);

  return res.json({
    currency: currencyCode,
    currencyName,
    count: items.length,
    items,
  });
});

app.get('/api/rates', async (req, res) => {
  const currencyCode = `${req.query.currency || 'AUD'}`.toUpperCase();

  if (!CURRENCY_MAP[currencyCode]) {
    return res.status(400).json({
      error: '不支持的币种',
      supportedCurrencies: Object.keys(CURRENCY_MAP),
    });
  }

  try {
    const rateRecord = await fetchRateRecord(currencyCode);

    try {
      await recordRateHistory(rateRecord);
    } catch (historyError) {
      console.error('[BOC Backend] Failed to persist history:', historyError);
    }

    return res.json(rateRecord);
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const details = error instanceof Error ? error.message : '未知错误';
    console.error(`[BOC Backend] Failed to fetch ${currencyCode}:`, details);
    return res.status(statusCode).json({
      error: statusCode >= 500 ? '无法从中国银行获取数据' : details,
      details,
    });
  }
});

app.post('/api/notify/telegram', async (req, res) => {
  const botToken = `${req.body?.botToken || TELEGRAM_BOT_TOKEN}`.trim();
  const chatId = `${req.body?.chatId || TELEGRAM_CHAT_ID}`.trim();
  const messages = Array.isArray(req.body?.messages)
    ? req.body.messages.map((message) => `${message}`.trim()).filter(Boolean)
    : [`${req.body?.message || ''}`.trim()].filter(Boolean);

  if (!messages.length) {
    return res.status(400).json({
      success: false,
      error: '消息内容不能为空',
    });
  }

  if (!botToken || !chatId) {
    return res.json({
      success: false,
      skipped: true,
      reason: 'telegram_not_configured',
    });
  }

  try {
    const sent = await sendTelegramMessages({
      botToken,
      chatId,
      messages: messages.slice(0, 10),
    });

    return res.json({
      success: true,
      sent,
    });
  } catch (error) {
    const details =
      axios.isAxiosError(error) && error.response?.data?.description
        ? error.response.data.description
        : error instanceof Error
          ? error.message
          : '未知错误';

    console.error('[BOC Backend] Failed to send Telegram message:', details);
    return res.status(502).json({
      success: false,
      error: 'Telegram 通知发送失败',
      details,
    });
  }
});

await loadHistoryStore();

app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================================');
  console.log('BOC Monitor Backend is running');
  console.log(`API Endpoint: http://0.0.0.0:${PORT}/api/rates`);
  console.log(`History API: http://0.0.0.0:${PORT}/api/history`);
  console.log(`Health Check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`Data Dir: ${DATA_DIR} (per-currency rates-{CODE}.ndjson)`);
  console.log('=================================================');
});
