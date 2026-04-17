# BOC Detect

中国银行多币种汇率监控项目。当前版本已经移除所有模拟数据逻辑，前端只会通过真实 Node.js 后端抓取中国银行官网汇率。

## 项目分析

项目现在由两部分组成：

- `frontend/`
  React + Vite 控制台，用于展示汇率、告警日志和监控配置。
- `backend/`
  Express 抓取服务，负责请求中国银行外汇牌价页面并解析目标币种的现汇卖出价。

核心链路如下：

1. 前端定时请求 `/api/rates?currency=AUD`
2. 后端抓取 [中国银行外汇牌价](https://www.boc.cn/sourcedb/whpj/)
3. 后端返回 `rawSellingRate`、`calculatedRate`、`pubTime`、`fetchTime`
4. 前端根据真实数据更新图表、日志和到价提醒

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 启动前后端

```bash
npm run dev
```

默认端口：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`
- 健康检查：`http://localhost:3001/api/health`

## Docker Compose

```bash
docker compose up --build
```

默认端口：

- 前端：`http://localhost:8080`
- 后端 API：`http://localhost:3001`

## 可用接口

### `GET /api/health`

返回服务健康状态。

### `GET /api/rates?currency=AUD`

返回指定币种的真实汇率数据。

支持币种：

- `AUD`
- `USD`
- `EUR`
- `GBP`
- `JPY`
- `HKD`

## 业务说明

中国银行页面展示的是“每 100 外币”的卖出价。例如 468.25 表示 100 澳元兑换 468.25 人民币。系统会自动将该值除以 100，换算为更直观的 1 外币兑人民币价格，用于阈值监控。

## 环境变量

后端支持以下可选环境变量：

- `PORT`：后端监听端口，默认 `3001`
- `REQUEST_TIMEOUT_MS`：抓取超时，默认 `10000`
- `BOC_SOURCE_URL`：中国银行汇率页面地址
- `CORS_ORIGIN`：允许的跨域来源，默认 `*`
