# BOC Detect

中国银行多币种汇率监控项目。当前版本已经移除所有模拟数据逻辑，前端可同时监控多种货币，并通过真实 Node.js 后端抓取中国银行官网汇率；后端会持久化历史汇率，并可发送 Telegram 到价提醒。

## 项目分析

项目现在由两部分组成：

- `frontend/`
  React + Vite 控制台，用于展示多币种实时汇率、历史走势、告警日志和监控配置。
- `backend/`
  Express 抓取服务，负责请求中国银行外汇牌价页面、保存历史汇率，并代发 Telegram 通知。

核心链路如下：

1. 前端在同一轮询周期内按顺序请求每个选中的币种，例如 `/api/rates?currency=AUD`
2. 后端抓取 [中国银行外汇牌价](https://www.boc.cn/sourcedb/whpj/)
3. 后端返回 `rawSellingRate`、`calculatedRate`、`pubTime`、`fetchTime`
4. 后端把新汇率写入持久化历史文件
5. 前端按币种分别更新卡片、图表、日志和到价提醒
6. 命中目标价后，后端可继续转发 Telegram 消息

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

`docker-compose` 已为后端挂载持久化卷 `backend-data`，历史汇率会保存在容器外。

## 可用接口

### `GET /api/health`

返回服务健康状态、历史文件路径，以及后端是否已配置 Telegram 环境变量。

### `GET /api/rates?currency=AUD`

返回指定币种的真实汇率数据，并在数据发生变化时持久化到历史文件。多个币种会由前端在同一个监控周期内逐个请求。

### `GET /api/history?currency=AUD&limit=500`

返回指定币种的历史汇率记录。

### `POST /api/notify/telegram`

请求体示例：

```json
{
  "messages": ["测试消息"],
  "botToken": "123456:token",
  "chatId": "123456789"
}
```

如果请求体未提供 `botToken` / `chatId`，后端会尝试使用环境变量中的 Telegram 配置。

## 支持币种

- `AUD`
- `USD`
- `EUR`
- `GBP`
- `JPY`
- `HKD`

## 业务说明

中国银行页面展示的是“每 100 外币”的卖出价。例如 468.25 表示 100 澳元兑换 468.25 人民币。系统会自动将该值除以 100，换算为更直观的 1 外币兑人民币价格，用于阈值监控。

历史图表会合并两类数据：

- 后端持久化保存的历史汇率
- 当前会话内最新抓取的数据

Telegram 通知策略：

- 每个币种的到价提醒会立即发送
- 异常通知只会在错误内容变化时再次发送，避免持续刷屏
- 日志和告警状态按币种分别维护

## 环境变量

后端支持以下可选环境变量：

- `PORT`：后端监听端口，默认 `3001`
- `REQUEST_TIMEOUT_MS`：抓取超时，默认 `10000`
- `BOC_SOURCE_URL`：中国银行汇率页面地址
- `CORS_ORIGIN`：允许的跨域来源，默认 `*`
- `DATA_DIR`：历史数据目录，默认 `backend/data`
- `MAX_HISTORY_PER_CURRENCY`：每个币种最多保留的历史条数，默认 `5000`
- `DEFAULT_HISTORY_LIMIT`：历史接口默认返回条数，默认 `500`
- `TELEGRAM_BOT_TOKEN`：Telegram 机器人 Token
- `TELEGRAM_CHAT_ID`：Telegram 目标聊天 ID
