import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { refreshYahooHistory } from './lib/yahooHistory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const DEFAULT_MONITOR_CONFIG = {
  monitoredCurrencies: [
    { currency: 'AUD' },
    { currency: 'USD' }
  ],
  checkIntervalSeconds: 10,
  calculationWindowDays: 14,
  trendComparisonMinutes: 60,
  isRunning: true,
  webhookUrl: '',
  telegramBotToken: '',
  telegramChatId: ''
};

const MIN_RANGE_MAP = {
  AUD: 0.04,
  USD: 0.05,
  JPY: 0.0030,
  EUR: 0.06,
  GBP: 0.06,
  HKD: 0.01,
};

const PORT = Number(process.env.PORT || process.env.API_BACKEND_PORT || 3001);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 10000);
const BOC_SOURCE_URL = process.env.BOC_SOURCE_URL || 'https://www.boc.cn/sourcedb/whpj/';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const LEGACY_HISTORY_FILE = path.join(DATA_DIR, 'rates-history.json');
const MAX_HISTORY_PER_CURRENCY = Number(process.env.MAX_HISTORY_PER_CURRENCY || 100000);
const DEFAULT_HISTORY_LIMIT = Number(process.env.DEFAULT_HISTORY_LIMIT || 2000);
const AUTO_REFRESH_YAHOO_HISTORY_ON_START =
  `${process.env.AUTO_REFRESH_YAHOO_HISTORY_ON_START || 'true'}`.toLowerCase() !== 'false';

const currencyFilePath = (code) => path.join(DATA_DIR, `rates-${code}.ndjson`);
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');
const MONITOR_CONFIG_FILE = path.join(DATA_DIR, 'monitor-config.json');
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
  'Referer': 'https://www.boc.cn/sourcedb/whpj/',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0'
};

let historyStore = null;
let historyLoadPromise = null;
let startupHistoryRefreshPromise = null;
const writeQueues = new Map();

const loadMonitorConfig = async () => {
  await ensureDataDirectory();
  try {
    const raw = await fs.readFile(MONITOR_CONFIG_FILE, 'utf8');
    const saved = JSON.parse(raw);
    
    // Merge saved config with defaults
    const config = { ...DEFAULT_MONITOR_CONFIG, ...saved };
    
    // Basic validation
    if (typeof config.checkIntervalSeconds !== 'number') {
      config.checkIntervalSeconds = DEFAULT_MONITOR_CONFIG.checkIntervalSeconds;
    }
    if (typeof config.calculationWindowDays !== 'number') {
      config.calculationWindowDays = DEFAULT_MONITOR_CONFIG.calculationWindowDays;
    }
    if (typeof config.trendComparisonMinutes !== 'number') {
      config.trendComparisonMinutes = DEFAULT_MONITOR_CONFIG.trendComparisonMinutes;
    }
    if (!Array.isArray(config.monitoredCurrencies)) {
      config.monitoredCurrencies = DEFAULT_MONITOR_CONFIG.monitoredCurrencies;
    }

    // Fallback to environment variables if not set in config file
    if (!config.telegramBotToken && TELEGRAM_BOT_TOKEN) {
      config.telegramBotToken = TELEGRAM_BOT_TOKEN;
    }
    if (!config.telegramChatId && TELEGRAM_CHAT_ID) {
      config.telegramChatId = TELEGRAM_CHAT_ID;
    }
    
    return config;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('[BOC Backend] Error reading monitor-config.json, using defaults:', error.message);
    }
    
    const config = { ...DEFAULT_MONITOR_CONFIG };
    if (!config.telegramBotToken && TELEGRAM_BOT_TOKEN) config.telegramBotToken = TELEGRAM_BOT_TOKEN;
    if (!config.telegramChatId && TELEGRAM_CHAT_ID) config.telegramChatId = TELEGRAM_CHAT_ID;
    
    return config;
  }
};

const saveMonitorConfig = async (newConfig) => {
  await ensureDataDirectory();
  
  // Standardize and validate
  let configToSave = { ...DEFAULT_MONITOR_CONFIG };
  
  if (newConfig && typeof newConfig === 'object') {
    // 1. checkIntervalSeconds
    const parsedInterval = Number.parseInt(newConfig.checkIntervalSeconds, 10);
    configToSave.checkIntervalSeconds = Number.isFinite(parsedInterval) 
      ? Math.max(10, parsedInterval) // 最小值强制为 10 秒
      : DEFAULT_MONITOR_CONFIG.checkIntervalSeconds;

    // 1.1 calculationWindowDays
    const parsedWindow = Number.parseInt(newConfig.calculationWindowDays, 10);
    configToSave.calculationWindowDays = Number.isFinite(parsedWindow)
      ? Math.max(1, Math.min(365, parsedWindow))
      : DEFAULT_MONITOR_CONFIG.calculationWindowDays;

    const parsedComparison = Number.parseInt(newConfig.trendComparisonMinutes, 10);
    configToSave.trendComparisonMinutes = Number.isFinite(parsedComparison)
      ? Math.max(1, Math.min(10080, parsedComparison)) // Max 1 week
      : DEFAULT_MONITOR_CONFIG.trendComparisonMinutes;
      
    // 2. isRunning
    configToSave.isRunning = newConfig.isRunning !== undefined 
      ? Boolean(newConfig.isRunning) 
      : DEFAULT_MONITOR_CONFIG.isRunning;
      
    // 3. strings
    configToSave.webhookUrl = newConfig.webhookUrl != null ? String(newConfig.webhookUrl) : DEFAULT_MONITOR_CONFIG.webhookUrl;
    configToSave.telegramBotToken = newConfig.telegramBotToken != null ? String(newConfig.telegramBotToken) : DEFAULT_MONITOR_CONFIG.telegramBotToken;
    configToSave.telegramChatId = newConfig.telegramChatId != null ? String(newConfig.telegramChatId) : DEFAULT_MONITOR_CONFIG.telegramChatId;
    
    // 4. monitoredCurrencies
    if (Array.isArray(newConfig.monitoredCurrencies)) {
      const validCurrencies = [];
      const seen = new Set();
      
      for (const item of newConfig.monitoredCurrencies) {
        if (item && typeof item === 'object' && typeof item.currency === 'string') {
          const code = item.currency.toUpperCase();
          if (CURRENCY_MAP[code] && !seen.has(code)) {
            seen.add(code);
            const currencyConfig = { currency: code };
            if (item.targetRate != null && !Number.isNaN(Number(item.targetRate))) {
              currencyConfig.targetRate = Number(item.targetRate);
            }
            validCurrencies.push(currencyConfig);
          }
        }
      }
      
      if (validCurrencies.length > 0) {
        configToSave.monitoredCurrencies = validCurrencies;
      }
    }
  }
  
  // Write to file
  await fs.writeFile(MONITOR_CONFIG_FILE, JSON.stringify(configToSave, null, 2), 'utf8');
  return configToSave;
};

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

const reloadHistoryStore = async () => {
  console.log('[BOC Backend] Reloading history store from disk...');
  historyStore = null;
  historyLoadPromise = null;
  await loadHistoryStore();
};

const findCurrencyRow = ($, currencyName) => {
  let matchedRow = null;

  // Use more specific selector for the price table
  $('#priceTable tr, .BOC_main table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 6) { // BOC table sometimes has fewer cells in mobile or certain views, but at least 6 for main data
      return;
    }

    const name = $(cells[0]).text().trim();
    if (name === currencyName) {
      matchedRow = cells;
      return false; // Break loop
    }
  });

  return matchedRow;
};

import https from 'node:https';
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true
});

const fetchRateRecord = async (currencyCode) => {
  const currencyName = CURRENCY_MAP[currencyCode];

  if (!currencyName) {
    const error = new Error('不支持的币种');
    error.statusCode = 400;
    throw error;
  }

  // Define fetchers for concurrent execution
  const fetchYahoo = async () => {
    const symbol = `${currencyCode}CNY=X`;
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=US&lang=en-US&includePrePost=false&interval=2m&useYfid=true&range=1d&corsDomain=finance.yahoo.com&.tsrc=finance`;
    
    const response = await axios.get(yahooUrl, {
      timeout: REQUEST_TIMEOUT_MS,
      httpsAgent,
    });
    
    const result = response.data?.chart?.result?.[0];
    if (!result || !result.meta || !result.meta.regularMarketPrice) {
      throw new Error('Yahoo Finance 数据结构异常');
    }

    const calculatedRate = result.meta.regularMarketPrice;
    const pubDateObj = new Date(result.meta.regularMarketTime * 1000 || Date.now());
    
    return {
      calculatedRate: Number(calculatedRate.toFixed(4)),
      pubTime: formatDateTime(pubDateObj),
      pubTimestampMs: pubDateObj.getTime(),
    };
  };

  const fetchBoc = async () => {
    const urlWithCacheBuster = BOC_SOURCE_URL + (BOC_SOURCE_URL.includes('?') ? '&' : '?') + `_t=${Date.now()}`;
    const response = await axios.get(urlWithCacheBuster, {
      headers: REQUEST_HEADERS,
      responseType: 'text',
      timeout: REQUEST_TIMEOUT_MS,
      httpsAgent,
    });

    const $ = cheerio.load(response.data);
    const row = findCurrencyRow($, currencyName);

    if (!row) {
      throw new Error(`未在中行页面找到 ${currencyName}`);
    }

    const rawSellingRate = Number.parseFloat($(row[3]).text().trim());
    if (!Number.isFinite(rawSellingRate)) {
      throw new Error(`无法解析中行 ${currencyName} 汇率`);
    }

    return {
      rawSellingRate,
      calculatedRate: Number((rawSellingRate / 100).toFixed(4)),
    };
  };

  // Run both fetchers concurrently
  const [yahooRes, bocRes] = await Promise.allSettled([fetchYahoo(), fetchBoc()]);

  if (yahooRes.status === 'rejected') {
    console.error(`[BOC Backend] Yahoo fetch failed for ${currencyCode}:`, yahooRes.reason.message);
    throw new Error(`从 Yahoo Finance 获取 ${currencyName} 失败: ${yahooRes.reason.message}`);
  }

  const fetchTimestampMs = Date.now();
  const fetchTime = formatDateTime();
  const yahooData = yahooRes.value;

  const record = {
    currency: currencyCode,
    currencyName,
    rawSellingRate: Number((yahooData.calculatedRate * 100).toFixed(2)), // Main raw rate derived from primary source
    calculatedRate: yahooData.calculatedRate, // Yahoo is primary
    pubTime: yahooData.pubTime,
    pubTimestampMs: yahooData.pubTimestampMs,
    fetchTime,
    fetchTimestampMs,
    source: 'Yahoo + BOC',
  };

  if (bocRes.status === 'fulfilled') {
    record.bocRate = bocRes.value.calculatedRate;
    record.bocRawRate = bocRes.value.rawSellingRate;
  } else {
    console.warn(`[BOC Backend] BOC fetch failed for ${currencyCode} (using Yahoo only):`, bocRes.reason.message);
  }

  return record;
};

const recordRateHistory = async (rateRecord) => {
  const store = await loadHistoryStore();
  const currentHistory = store[rateRecord.currency] || (store[rateRecord.currency] = []);
  const lastRecord = currentHistory[currentHistory.length - 1];

  const FORCE_RECORD_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  const lastTimeMs = lastRecord?.fetchTimestampMs || 0;

  if (
    lastRecord &&
    lastRecord.pubTime === rateRecord.pubTime &&
    lastRecord.rawSellingRate === rateRecord.rawSellingRate &&
    (rateRecord.fetchTimestampMs - lastTimeMs) < FORCE_RECORD_INTERVAL_MS
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

const sendWebhookMessages = async ({ webhookUrl, messages }) => {
  let sentCount = 0;

  for (const text of messages) {
    try {
      let payload = { text };

      // Intelligent formatting based on URL
      if (webhookUrl.includes('qyapi.weixin.qq.com') || webhookUrl.includes('oapi.dingtalk.com')) {
        // WeCom or DingTalk
        payload = {
          msgtype: 'text',
          text: { content: text }
        };
      } else if (webhookUrl.includes('open.feishu.cn')) {
        // Feishu
        payload = {
          msg_type: 'text',
          content: { text }
        };
      } else if (webhookUrl.includes('api.day.app')) {
        // Bark
        payload = {
          title: 'BOC 汇率提醒',
          body: text,
          group: 'CurrencyMonitor'
        };
      }

      await axios.post(webhookUrl, payload, { timeout: REQUEST_TIMEOUT_MS });
      sentCount += 1;
    } catch (err) {
      console.error(`[BOC Backend] Webhook delivery failed:`, err.message);
    }
  }

  return sentCount;
};

app.get('/api/config', async (req, res) => {
  try {
    const config = await loadMonitorConfig();
    return res.json({ success: true, config });
  } catch (error) {
    console.error('[BOC Backend] Failed to get config:', error);
    return res.status(500).json({ success: false, error: '获取配置失败' });
  }
});

app.put('/api/config', async (req, res) => {
  try {
    const config = await saveMonitorConfig(req.body);
    restartBackgroundWorker(); // Refresh the interval dynamically when settings change
    return res.json({ success: true, config });
  } catch (error) {
    console.error('[BOC Backend] Failed to save config:', error);
    return res.status(500).json({ success: false, error: '保存配置失败' });
  }
});

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

app.post('/api/history/reload', async (req, res) => {
  try {
    await reloadHistoryStore();
    return res.json({ success: true, message: '历史数据缓存已刷新' });
  } catch (error) {
    console.error('[BOC Backend] Failed to reload history store:', error);
    return res.status(500).json({ success: false, error: '刷新历史数据失败' });
  }
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

app.get('/api/alerts', async (req, res) => {
  try {
    const raw = await fs.readFile(ALERTS_FILE, 'utf8');
    const alerts = JSON.parse(raw);
    return res.json({ success: true, alerts });
  } catch (error) {
    return res.json({ success: true, alerts: [] });
  }
});

app.delete('/api/alerts', async (req, res) => {
  try {
    await fs.writeFile(ALERTS_FILE, JSON.stringify([], null, 2), 'utf8');
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: '清空告警失败' });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const config = await loadMonitorConfig();
    const store = await loadHistoryStore();
    const comparisonMs = config.trendComparisonMinutes * 60 * 1000;
    const now = Date.now();
    
    const dashboardData = {
      rates: {},
      alerts: []
    };
    
    // Get alerts
    try {
      const rawAlerts = await fs.readFile(ALERTS_FILE, 'utf8');
      dashboardData.alerts = JSON.parse(rawAlerts);
    } catch (e) {}
    
    // Get rates for monitored currencies
    for (const item of config.monitoredCurrencies) {
      const code = item.currency;
      const history = store[code] || [];
      
      if (history.length > 0) {
        const current = history[history.length - 1];
        
        // Find previous rate based on trendComparisonMinutes
        let previous = history[0];
        const targetTs = now - comparisonMs;
        
        // Binary search or simple reverse find
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].fetchTimestampMs <= targetTs) {
            previous = history[i];
            break;
          }
        }
        
        dashboardData.rates[code] = {
          current,
          previous
        };
      } else {
        dashboardData.rates[code] = {
          current: null,
          previous: null
        };
      }
    }
    
    res.json({ success: true, ...dashboardData });
  } catch (error) {
    console.error('[BOC Backend] Dashboard API failed:', error);
    res.status(500).json({ success: false, error: '获取仪表盘数据失败' });
  }
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
      console.error(`[BOC Backend] Failed to persist history for ${currencyCode}:`, historyError.message);
    }

    return res.json(rateRecord);
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const details = error instanceof Error ? error.message : '未知错误';
    
    console.error(`[BOC Backend] Failed to fetch ${currencyCode}:`, details);

    return res.status(statusCode).json({
      error: statusCode >= 500 ? '无法获取数据' : details,
      details,
      code: error?.code,
    });
  }
});

// Background Worker System
let currentTimerId = null;

const calculateDynamicThresholds = async (currencyCode, windowDays = 14) => {
  const store = await loadHistoryStore();
  const history = store[currencyCode] || [];
  if (history.length === 0) return null;

  const now = Date.now();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  
  // Filter by time window
  let pool = history.filter(r => r.fetchTimestampMs && (now - r.fetchTimestampMs) <= windowMs);
  
  let usedFallback = false;
  if (pool.length < 5) {
    pool = history;
    usedFallback = true;
  }

  // 按小时聚合数据点，以消除高频实时采样对百分位数计算的权重污染
  const hourlyBuckets = new Map();
  for (const r of pool) {
    if (!r.calculatedRate || r.calculatedRate <= 0) continue;
    // 取小时级别的时间戳作为 Key
    const hourKey = Math.floor(r.fetchTimestampMs / (60 * 60 * 1000));
    if (!hourlyBuckets.has(hourKey)) {
      hourlyBuckets.set(hourKey, []);
    }
    hourlyBuckets.get(hourKey).push(r.calculatedRate);
  }

  // 每个小时取平均值作为一个代表性样本点
  const rates = Array.from(hourlyBuckets.values())
    .map(bucketRates => {
      const sum = bucketRates.reduce((a, b) => a + b, 0);
      return sum / bucketRates.length;
    })
    .sort((a, b) => a - b);
    
  if (rates.length < 5) return null; // Too few hourly data points for reliable calculation
  
  const p10 = rates[Math.floor(rates.length * 0.10)];
  const p90 = rates[Math.floor(rates.length * 0.90)];
  
  let range = p90 - p10;
  const minRange = MIN_RANGE_MAP[currencyCode] || 0.05;
  if (range < minRange) range = minRange;
  
  const bestZoneUpper = p10 + range * 0.12;
  const goodZoneUpper = p10 + range * 0.25;
  const buffer = range * 0.05;
  
  console.log(`[Debug Threshold] ${currencyCode} | Window: ${windowDays}d | Fallback: ${usedFallback} | Samples: ${rates.length} | p10: ${p10}, p90: ${p90}, range: ${range.toFixed(4)}, bestZone: ${bestZoneUpper.toFixed(4)}, goodZone: ${goodZoneUpper.toFixed(4)}`);

  return {
    p10,
    p90,
    range,
    bestZoneUpper,
    goodZoneUpper,
    buffer
  };
};

const evaluateTargetAlerts = async (rateRecord, config, botToken, chatId) => {
  const currencyCode = rateRecord.currency;
  const currencyConfig = config.monitoredCurrencies?.find(c => c.currency === currencyCode);
  const targetRate = currencyConfig?.targetRate;

  const thresholds = await calculateDynamicThresholds(currencyCode, config.calculationWindowDays);
  if (!thresholds) return;

  const { bestZoneUpper, goodZoneUpper, buffer, range } = thresholds;
  const currentRate = rateRecord.calculatedRate;
  const bocRate = rateRecord.bocRate;
  
  const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000; // 同级别通知冷却 1 小时
  const LEAVE_CONFIRM_MS = 30 * 60 * 1000;   // 离开区间需持续确认 30 分钟

  // Initialize state flags
  global.alertStateFlags = global.alertStateFlags || {};
  if (!global.alertStateFlags[currencyCode]) {
    global.alertStateFlags[currencyCode] = {
      hasNotifiedGood: false,
      hasNotifiedBest: false,
      hasNotifiedTarget: false,
      lastNotifiedRate: null,
      lastNotifiedTime: null,
      firstLeaveTime: null
    };
  }

  const state = global.alertStateFlags[currencyCode];
  const messages = [];

  const canNotify = () => {
    if (!state.lastNotifiedTime) return true;
    return (Date.now() - state.lastNotifiedTime) > NOTIFY_COOLDOWN_MS;
  };

  const buildMessage = (title, advice, showComparison = false) => {
    let msg = `${title}\n`;
    if (bocRate) {
      msg += `BOC 卖出价：¥${bocRate.toFixed(4)}\n`;
    }
    msg += `当前参考价：¥${currentRate.toFixed(4)}\n`;
    msg += `适合区上限：¥${goodZoneUpper.toFixed(4)}\n`;
    msg += `强烈区上限：¥${bestZoneUpper.toFixed(4)}\n`;
    
    if (showComparison && state.lastNotifiedRate && currentRate < state.lastNotifiedRate) {
      msg += `较上次通知更低：¥${state.lastNotifiedRate.toFixed(4)} → ¥${currentRate.toFixed(4)}\n`;
    }
    
    msg += `\n${advice}`;
    return msg;
  };

  // 1. Check Custom Target Rate (Highest Priority) with Hysteresis
  // If already notified, only reset flag if it rises above target + buffer
  const effectiveTargetRate = state.hasNotifiedTarget ? (targetRate + buffer) : targetRate;
  if (targetRate && currentRate <= effectiveTargetRate) {
    if (!state.hasNotifiedTarget) {
      state.hasNotifiedTarget = true;
      messages.push(buildMessage(`🎯 [${rateRecord.currencyName}] 达到自定义目标买入价`, `当前汇率已跌破您设定的目标价 ¥${targetRate.toFixed(4)}，适合优先换汇`, false));
      // Target rate notification is independent and has no mandatory cooldown
    }
  } else if (targetRate && currentRate > targetRate + buffer) {
    state.hasNotifiedTarget = false;
  }

  // 2. Dynamic Thresholds with Hysteresis
  const effectiveBestZoneUpper = state.hasNotifiedBest ? (bestZoneUpper + buffer) : bestZoneUpper;
  const effectiveGoodZoneUpper = state.hasNotifiedGood ? (goodZoneUpper + buffer) : goodZoneUpper;

  if (currentRate <= effectiveBestZoneUpper) {
    state.firstLeaveTime = null; // 重置离开确认时间
    
    if (!state.hasNotifiedBest) {
      state.hasNotifiedBest = true;
      state.hasNotifiedGood = true;
      
      messages.push(buildMessage(`📉 [${rateRecord.currencyName}] 进入强烈换汇区`, '适合优先换汇', false));
      state.lastNotifiedRate = currentRate;
      state.lastNotifiedTime = Date.now();
    } else if (state.lastNotifiedRate && (state.lastNotifiedRate - currentRate) >= (range * 0.02) && canNotify()) {
      // Significantly lower than last notified rate in the same zone
      messages.push(buildMessage(`📉 [${rateRecord.currencyName}] 强烈换汇区内发现更低汇率`, '适合优先换汇', true));
      state.lastNotifiedRate = currentRate;
      state.lastNotifiedTime = Date.now();
    }
  } else if (currentRate <= effectiveGoodZoneUpper) {
    state.firstLeaveTime = null; // 重置离开确认时间
    
    if (state.hasNotifiedBest) {
      // Rebounded from Best to Good zone
      state.hasNotifiedBest = false;
      messages.push(buildMessage(`📈 [${rateRecord.currencyName}] 汇率小幅反弹`, '已从强烈区退回到适合区，仍可考虑分批换汇', false));
      state.lastNotifiedRate = currentRate;
      state.lastNotifiedTime = Date.now();
    } else if (!state.hasNotifiedGood) {
      state.hasNotifiedGood = true;
      
      messages.push(buildMessage(`✅ [${rateRecord.currencyName}] 进入适合换汇区`, '可考虑分批换汇', false));
      state.lastNotifiedRate = currentRate;
      state.lastNotifiedTime = Date.now();
    } else if (state.lastNotifiedRate && (state.lastNotifiedRate - currentRate) >= (range * 0.02) && canNotify()) {
      messages.push(buildMessage(`✅ [${rateRecord.currencyName}] 适合换汇区内发现更低汇率`, '可考虑分批换汇', true));
      state.lastNotifiedRate = currentRate;
      state.lastNotifiedTime = Date.now();
    }
  } else if (currentRate > effectiveGoodZoneUpper + buffer) {
    if (state.hasNotifiedGood || state.hasNotifiedBest) {
      // 记录初次离开时间
      if (!state.firstLeaveTime) {
        state.firstLeaveTime = Date.now();
        console.log(`[BOC Backend Background] ${currencyCode} crossed leave threshold, waiting for confirmation...`);
      } else if (Date.now() - state.firstLeaveTime >= LEAVE_CONFIRM_MS) {
        // 只有持续超过 30 分钟才确认离开
        state.hasNotifiedGood = false;
        state.hasNotifiedBest = false;
        state.lastNotifiedRate = null;
        state.lastNotifiedTime = null;
        state.firstLeaveTime = null;
        
        let msg = `📈 [${rateRecord.currencyName}] 已离开适合换汇区\n`;
        if (bocRate) {
          msg += `BOC 卖出价：¥${bocRate.toFixed(4)}\n`;
        }
        msg += `当前参考价：¥${currentRate.toFixed(4)}\n`;
        msg += `适合区上限：¥${goodZoneUpper.toFixed(4)}\n`;
        msg += `\n已持续高于上限超过 30 分钟，建议观望`;
        
        messages.push(msg);
      }
    }
  }

  if (messages.length > 0) {
    console.log(`[BOC Backend Background] Alert triggered for ${currencyCode}: ${messages[0].split('\n')[0]}`);
    try {
      if (botToken && chatId) {
        await sendTelegramMessages({
          botToken,
          chatId,
          messages,
        });
      }

      if (config.webhookUrl) {
        await sendWebhookMessages({
          webhookUrl: config.webhookUrl,
          messages,
        });
      }

      // Save to local alert history
      for (const msg of messages) {
        await saveAlertLog({
          type: 'target_hit',
          message: msg,
          currency: currencyCode
        });
      }
    } catch (err) {
      console.error(`[BOC Backend Background] Alert processing failed for ${currencyCode}:`, err.message);
    }
  }
};

const saveAlertLog = async (alert) => {
  await ensureDataDirectory();
  const logEntry = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: formatDateTime(),
    timestampMs: Date.now(),
    read: false,
    ...alert
  };
  
  try {
    let currentAlerts = [];
    try {
      const raw = await fs.readFile(ALERTS_FILE, 'utf8');
      currentAlerts = JSON.parse(raw);
    } catch (e) {}
    
    currentAlerts.unshift(logEntry);
    // Keep last 200 alerts
    if (currentAlerts.length > 200) currentAlerts = currentAlerts.slice(0, 200);
    
    await fs.writeFile(ALERTS_FILE, JSON.stringify(currentAlerts, null, 2), 'utf8');
  } catch (error) {
    console.error('[BOC Backend] Failed to save alert log:', error);
  }
};

const runBackgroundCheck = async () => {
  try {
    const config = await loadMonitorConfig();
    
    if (!config.isRunning || !config.monitoredCurrencies || config.monitoredCurrencies.length === 0) {
      return;
    }
    
    const botToken = config.telegramBotToken || TELEGRAM_BOT_TOKEN;
    const chatId = config.telegramChatId || TELEGRAM_CHAT_ID;
    
    for (const currencyConfig of config.monitoredCurrencies) {
      try {
        const rateRecord = await fetchRateRecord(currencyConfig.currency);
        await recordRateHistory(rateRecord);
        // evaluateTargetAlerts expects the full system config, not currencyConfig
        await evaluateTargetAlerts(rateRecord, config, botToken, chatId);
      } catch (error) {
        console.error(`[BOC Backend Background] Error checking ${currencyConfig.currency}:`, error.message);
      }
      
      // Delay between currencies to avoid overwhelming the source
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
  } catch (error) {
    console.error('[BOC Backend Background] Cycle failed:', error.message);
  }
};

const restartBackgroundWorker = async () => {
  if (currentTimerId) {
    clearInterval(currentTimerId);
    currentTimerId = null;
  }
  
  const config = await loadMonitorConfig();
  
  if (config.isRunning && config.checkIntervalSeconds >= 10) {
    console.log(`[BOC Backend Background] Starting background worker... Interval: ${config.checkIntervalSeconds}s`);
    runBackgroundCheck(); // Run immediately once
    currentTimerId = setInterval(runBackgroundCheck, config.checkIntervalSeconds * 1000);
  } else {
    console.log(`[BOC Backend Background] Worker is stopped or disabled by config.`);
  }
};

const refreshYahooHistoryOnStartup = async () => {
  if (!AUTO_REFRESH_YAHOO_HISTORY_ON_START) {
    console.log('[BOC Backend] Startup Yahoo history refresh is disabled.');
    return { skipped: true };
  }

  if (startupHistoryRefreshPromise) {
    return startupHistoryRefreshPromise;
  }

  startupHistoryRefreshPromise = (async () => {
    console.log('[BOC Backend] Starting Yahoo history refresh on startup...');

    const summary = await refreshYahooHistory({
      dataDir: DATA_DIR,
      currencyMap: CURRENCY_MAP,
      timeoutMs: Math.max(REQUEST_TIMEOUT_MS, 15000),
      sleepMs: 500,
      logger: console,
    });

    await reloadHistoryStore();

    console.log(
      `[BOC Backend] Startup Yahoo history refresh completed. Success=${summary.successCount}, Failed=${summary.failureCount}`
    );

    return summary;
  })();

  try {
    return await startupHistoryRefreshPromise;
  } finally {
    startupHistoryRefreshPromise = null;
  }
};

app.post('/api/notify/webhook', async (req, res) => {
  const webhookUrl = `${req.body?.webhookUrl || ''}`.trim();
  const messages = Array.isArray(req.body?.messages)
    ? req.body.messages.map((message) => `${message}`.trim()).filter(Boolean)
    : [`${req.body?.message || ''}`.trim()].filter(Boolean);

  if (!messages.length) {
    return res.status(400).json({ success: false, error: '消息内容不能为空' });
  }

  if (!webhookUrl) {
    return res.status(400).json({ success: false, error: 'Webhook URL 不能为空' });
  }

  try {
    const sent = await sendWebhookMessages({
      webhookUrl,
      messages: messages.slice(0, 10),
    });

    return res.json({ success: true, sent });
  } catch (error) {
    console.error('[BOC Backend] Failed to send Webhook message:', error.message);
    return res.status(502).json({
      success: false,
      error: 'Webhook 发送失败',
      details: error.message,
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

try {
  // Run the Yahoo backfill before the worker starts so NDJSON writes stay serialized.
  await refreshYahooHistoryOnStartup();
} catch (error) {
  const details = error instanceof Error ? error.message : '未知错误';
  console.error('[BOC Backend] Startup Yahoo history refresh failed:', details);
}

restartBackgroundWorker();

app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================================');
  console.log('BOC Monitor Backend is running');
  console.log(`API Endpoint: http://0.0.0.0:${PORT}/api/rates`);
  console.log(`History API: http://0.0.0.0:${PORT}/api/history`);
  console.log(`Health Check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`Data Dir: ${DATA_DIR} (per-currency rates-{CODE}.ndjson)`);
  console.log('=================================================');
});
