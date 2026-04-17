import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';

const app = express();

const PORT = Number(process.env.PORT || process.env.API_BACKEND_PORT || 3001);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 10000);
const BOC_SOURCE_URL = process.env.BOC_SOURCE_URL || 'https://www.boc.cn/sourcedb/whpj/';
const rawCorsOrigin = process.env.CORS_ORIGIN || '*';

const corsOrigin =
  rawCorsOrigin === '*'
    ? true
    : rawCorsOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

app.use(cors({ origin: corsOrigin }));

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

const formatDateTime = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'boc-monitor-backend',
    source: BOC_SOURCE_URL,
    timestamp: formatDateTime(),
  });
});

app.get('/api/rates', async (req, res) => {
  const currencyCode = `${req.query.currency || 'AUD'}`.toUpperCase();
  const currencyName = CURRENCY_MAP[currencyCode];

  if (!currencyName) {
    return res.status(400).json({
      error: '不支持的币种',
      supportedCurrencies: Object.keys(CURRENCY_MAP),
    });
  }

  try {
    const response = await axios.get(BOC_SOURCE_URL, {
      headers: REQUEST_HEADERS,
      responseType: 'text',
      timeout: REQUEST_TIMEOUT_MS,
    });

    const $ = cheerio.load(response.data);
    const row = findCurrencyRow($, currencyName);

    if (!row) {
      return res.status(404).json({
        error: `未在中国银行页面上找到 ${currencyName} 的数据`,
      });
    }

    const rawSellingRate = Number.parseFloat($(row[3]).text().trim());
    const pubDate = $(row[6]).text().trim();
    const pubTime = $(row[7]).text().trim();
    const publicationTime = pubDate.includes(':') ? pubDate : `${pubDate} ${pubTime}`.trim();

    if (!Number.isFinite(rawSellingRate) || !publicationTime) {
      return res.status(502).json({
        error: `已找到 ${currencyName}，但页面结构异常，无法解析汇率`,
      });
    }

    return res.json({
      currency: currencyCode,
      currencyName,
      rawSellingRate,
      calculatedRate: Number((rawSellingRate / 100).toFixed(4)),
      pubTime: publicationTime,
      fetchTime: formatDateTime(),
      source: BOC_SOURCE_URL,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : '未知错误';
    console.error(`[BOC Backend] Failed to fetch ${currencyCode}:`, details);
    return res.status(500).json({
      error: '无法从中国银行获取数据',
      details,
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================================');
  console.log('BOC Monitor Backend is running');
  console.log(`API Endpoint: http://0.0.0.0:${PORT}/api/rates`);
  console.log(`Health Check: http://0.0.0.0:${PORT}/api/health`);
  console.log('=================================================');
});
