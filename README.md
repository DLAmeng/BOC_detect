# BOC Detect

中国银行多币种汇率监控项目。当前版本已升级为**双数据源架构**，引入了 **Yahoo Finance** 高频汇率作为主参考，并保留 **中国银行（BOC）官网** 汇率作为实盘对比。

后端已集成 **后台监控系统 (Background Worker)**，可自动执行轮询、持久化历史记录、动态计算汇率阈值，并通过 Telegram 发送分级告警通知（适合换汇区 / 强烈换汇区）。

## 核心特性

- **双数据源校验**：主攻 Yahoo Finance 实时接口，辅以 BOC 官网爬虫，确保汇率参考与银行挂牌价同步。
- **后台自动监控**：后端独立运行 Background Worker，无需前端常开即可实现 7x24 小时监控。
- **动态阈值模型**：基于过去 14 天（可配置）的历史汇率位点（p10/p90），动态生成“适合换汇”与“强烈换汇”区间。
- **分级通知策略**：命中不同区间触发不同强度的 Telegram 提醒，并具备防抖机制避免消息轰炸。
- **数据持久化升级**：历史汇率按币种存储为独立的 `.ndjson` 文件，支持启动时自动回填 Yahoo 近一年历史数据。

## 项目结构

- `frontend/`：React + Vite 控制台。用于展示多币种实时对比、历史走势图表、告警日志，并可动态下发后端监控配置。
- `backend/`：Node.js (Express) 服务。负责后台轮询、数据抓取（Yahoo & BOC）、动态阈值计算、Telegram 发信。

## 核心链路

1. **启动与回填**：后端启动时若开启 `AUTO_REFRESH_YAHOO_HISTORY_ON_START`，将自动从 Yahoo Finance 拉取各币种过去一年的历史日线数据。
2. **后台轮询 (Background Worker)**：
   - 根据 `monitor-config.json` 中的 `checkIntervalSeconds` 定时触发。
   - 并发请求 Yahoo Finance 和中行外汇牌价。
   - 自动对比历史数据，计算当前处于哪个换汇区间（Best / Good / Wait）。
   - 将最新数据点追加到 `backend/data/rates-{CODE}.ndjson`。
3. **告警下发**：若检测到汇率进入更优区间，通过 Telegram API 发送格式化通知。
4. **前端同步**：前端通过 API 获取后端实时抓取的数据和配置状态。

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

## Docker Compose

```bash
docker compose up --build
```

- 前端（Nginx 转发）：`http://localhost:8080`
- 后端 API：`http://localhost:3001`

`docker-compose` 已为后端挂载持久化卷 `backend-data`，所有 `.ndjson` 历史文件和监控配置文件均保存在容器外。

## API 接口说明

### 监控配置
- `GET /api/config`：获取当前后台监控配置（轮询间隔、币种、通知 ID 等）。
- `PUT /api/config`：动态修改监控配置，保存后后台 Worker 将自动重启。

### 汇率数据
- `GET /api/rates?currency=AUD`：获取特定币种的最新抓取结果（含 Yahoo 与 BOC 对比）。
- `GET /api/history?currency=AUD&limit=1000`：获取历史记录。

### 维护工具
- `POST /api/history/reload`：手动强制重新加载所有币种的 NDJSON 缓存。
- `GET /api/health`：服务健康状态及环境变量加载情况。

## 环境变量 (backend/.env)

- `PORT`：后端端口，默认 `3001`
- `DATA_DIR`：数据存储路径，默认 `backend/data`
- `AUTO_REFRESH_YAHOO_HISTORY_ON_START`：是否在启动时同步雅虎一年历史数据，默认 `true`
- `TELEGRAM_BOT_TOKEN`：Telegram 机器人 Token
- `TELEGRAM_CHAT_ID`：接收通知的 Chat ID
- `CORS_ORIGIN`：允许跨域的域名
- `REQUEST_TIMEOUT_MS`：抓取超时设置

## 支持币种

目前支持：`AUD` (澳元), `USD` (美元), `EUR` (欧元), `GBP` (英镑), `JPY` (日元), `HKD` (港币)。
