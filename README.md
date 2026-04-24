# BOC Detect

中国银行多币种汇率监控项目。当前版本已升级为**完全服务端驱动的现代化架构**，前端作为纯展示层，所有核心判定、告警历史与趋势计算均由后端集中管理。

## 核心特性

- **双数据源校验**：主攻 Yahoo Finance 高频实时接口，辅以中国银行（BOC）官网爬虫作实盘参考。
- **服务端驱动展示**：前端不再独立计算阈值。刷新网页时，直接从后端拉取完整的系统状态，彻底解决浏览器刷新导致的状态丢失问题。
- **告警日志持久化**：后端集成 `alerts.json` 自动记录触发过的 Telegram 警报，支持告警历史的云端拉取与管理。
- **后台自动监控**：独立运行 Background Worker，7x24 小时执行轮询、数据持久化与 Telegram 分级告警。
- **动态阈值模型**：基于过去 14 天（可配置）的历史汇率位点（p10/p90），自动判定“适合换汇”与“强烈换汇”区间。
- **可配置趋势对比**：支持在管理端自定义“对比跨度”（如 1 小时、1 天），自动算出当前汇率相对于该时间点的涨跌幅。
- **数据持久化升级**：历史记录存储为单币种独立的 `.ndjson` 文件，支持启动时自动回填 Yahoo 近一年历史数据。

## 项目结构

- `frontend/`：React + Vite 控制台。作为“傻瓜式显示器”，负责渲染汇率卡片、丝滑图表及管理后端配置。
- `backend/`：Node.js (Express) 服务。系统的“大脑”，负责轮询抓取、逻辑计算、告警持久化及 Telegram 通知。

## 核心链路

1. **初始化**：后端启动时若开启 `AUTO_REFRESH_YAHOO_HISTORY_ON_START`，将自动同步各币种过去一年的 Yahoo 历史日线数据。
2. **后台轮询 (Background Worker)**：
   - 根据监控配置定时并发抓取 Yahoo 与中行数据。
   - 自动计算当前处于哪个换汇区间（Best / Good / Wait）。
   - 触发告警时，同时发送 Telegram 消息并将其写入 `backend/data/alerts.json`。
   - 将数据点追加到 `.ndjson` 历史文件中。
3. **前端消费**：
   - 前端通过 `/api/dashboard` 接口一键拉取所有监控币种的当前价、根据设定跨度算出的对比价、以及最新的系统告警日志。
   - 即使网页刷新，通知栏与涨跌标识依然保持同步。

## 本地开发

### 1. 安装依赖
```bash
npm install
```

### 2. 启动服务
```bash
npm run dev
```

默认端口：
- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:3001`

## Docker Compose
```bash
docker compose up --build
```
- 前端（Nginx 转发）：`http://localhost:8080`
- 后端 API：`http://localhost:3001`

`docker-compose` 已为后端挂载持久化卷 `backend-data`，所有 `.ndjson` 历史文件、告警记录和监控配置文件均保存在容器外。

## API 接口说明

### 仪表盘集成
- `GET /api/dashboard`：【核心接口】获取所有监控币种的实时数据（current）、趋势对比数据（previous）以及持久化的告警日志列表。

### 告警管理
- `GET /api/alerts`：拉取后端保存的历史告警。
- `DELETE /api/alerts`：清空后端告警记录。

### 监控配置
- `GET /api/config`：获取当前后台监控配置。
- `PUT /api/config`：动态修改配置（包含对比跨度 `trendComparisonMinutes` 等）。

### 其他
- `GET /api/rates?currency=AUD`：实时手动抓取单币种汇率。
- `GET /api/history?currency=AUD&limit=1000`：拉取特定币种的历史记录。
- `POST /api/history/reload`：强制刷新后端 NDJSON 缓存。

## 环境变量 (backend/.env)

- `PORT`：后端端口
- `DATA_DIR`：数据存储路径
- `AUTO_REFRESH_YAHOO_HISTORY_ON_START`：启动时回填开关，默认 `true`
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`：告警通知配置
