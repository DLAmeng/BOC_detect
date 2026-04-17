import React from 'react';
import { FileText, Server, Code, Database, Bell, Terminal } from 'lucide-react';

export const ArchitectureDocs: React.FC = () => {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-6">
            <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-4">
                <FileText className="w-6 h-6 text-blue-400" />
                <h2 className="text-xl font-bold text-white">系统架构与运行指南</h2>
            </div>

            <div className="mb-8 bg-blue-900/20 border border-blue-800/50 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-blue-300 mb-3 flex items-center gap-2">
                    <Terminal className="w-5 h-5" />
                    如何运行真实后端服务？
                </h3>
                <div className="text-sm text-blue-100 space-y-3 leading-relaxed">
                    <p>当前版本只有一套真实数据链路：前端调用 `/api/rates`，Node.js 后端实时抓取中国银行官网汇率。</p>
                    <div className="bg-gray-950 p-4 rounded border border-gray-800 font-mono text-xs text-gray-300 space-y-2">
                        <p className="text-gray-500"># 本地开发</p>
                        <p className="text-green-400">npm install</p>
                        <p className="text-green-400">npm run dev</p>
                        <p className="text-gray-500 mt-2"># 或者使用 Docker Compose</p>
                        <p className="text-green-400">docker compose up --build</p>
                    </div>
                    <p>后端健康检查地址为 <code>/api/health</code>，历史数据接口为 <code>/api/history</code>，Telegram 通知接口为 <code>/api/notify/telegram</code>。当前版本支持多币种同时监控，前端会在同一轮询周期内逐个抓取选中的币种。</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <section>
                        <h3 className="text-lg font-semibold text-gray-200 mb-2 flex items-center gap-2">
                            <Server className="w-4 h-4 text-gray-400" />
                            1. 数据源 (Node.js / Cheerio)
                        </h3>
                        <p className="text-sm text-gray-400 leading-relaxed">
                            后端利用 <code>axios</code> 获取中国银行外汇牌价 HTML，并使用 <code>cheerio</code> 解析表格，提取目标币种的“现汇卖出价”和“发布时间”。当前前端可在一个监控周期里顺序请求多个币种，既实现多币种监控，也避免并发突发请求过猛。抓取结果会被写入本地持久化文件，供图表跨重启加载。
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-gray-200 mb-2 flex items-center gap-2">
                            <Code className="w-4 h-4 text-gray-400" />
                            2. 前端处理逻辑
                        </h3>
                        <p className="text-sm text-gray-400 leading-relaxed">
                            前端只调用真实 API，不再生成模拟汇率。每个监控币种都有独立的目标价、历史曲线和告警状态。中行页面显示的是每 100 外币的价格，因此系统会将 <code>rawSellingRate</code> 除以 100，换算成更直观的 1 外币兑人民币价格，并把后端持久化历史与当前会话的新数据合并展示。
                        </p>
                    </section>
                </div>

                <div className="space-y-6">
                    <section>
                        <h3 className="text-lg font-semibold text-gray-200 mb-2 flex items-center gap-2">
                            <Database className="w-4 h-4 text-gray-400" />
                            3. 状态管理 (防刷屏机制)
                        </h3>
                        <p className="text-sm text-gray-400 leading-relaxed">
                            系统会按币种分别记录 <code>lastAlertedRate</code>。当某个币种跌破自身阈值时触发提醒，只有该币种价格继续创新低，或先回升到阈值上方后再次跌破，才会发送新的到价通知。
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-gray-200 mb-2 flex items-center gap-2">
                            <Bell className="w-4 h-4 text-gray-400" />
                            4. 通知日志
                        </h3>
                        <p className="text-sm text-gray-400 leading-relaxed">
                            控制台会记录真实抓取产生的更新、到价与异常消息。配置 Telegram 后，到价提醒会直接通过后端发送；异常通知则会在错误信息变化时再发送，避免连续刷屏。日志面板会标出触发消息的币种，方便同时监控多种货币时快速定位。
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};
