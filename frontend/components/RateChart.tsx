import React, { useEffect, useState } from 'react';
import { RateData } from '../types.ts';
import { fetchRateHistory } from '../utils/api.ts';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

type TimeRange = 'session' | '1h' | '6h' | '24h' | '7d' | '30d' | '1y';

interface Props {
    history: RateData[];
    targetRate: number;
    currency: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const RANGE_WINDOWS: Record<Exclude<TimeRange, 'session'>, number> = {
    '1h': HOUR_MS,
    '6h': 6 * HOUR_MS,
    '24h': 24 * HOUR_MS,
    '7d': 7 * DAY_MS,
    '30d': 30 * DAY_MS,
    '1y': 365 * DAY_MS,
};

const RANGES: { value: TimeRange; label: string }[] = [
    { value: 'session', label: '当前会话' },
    { value: '1h', label: '1 小时' },
    { value: '6h', label: '6 小时' },
    { value: '24h', label: '24 小时' },
    { value: '7d', label: '7 天' },
    { value: '30d', label: '30 天' },
    { value: '1y', label: '1 年' },
];

export const RateChart: React.FC<Props> = ({ history, targetRate, currency }) => {
    const [timeRange, setTimeRange] = useState<TimeRange>('1h');
    const [persistedHistory, setPersistedHistory] = useState<RateData[]>([]);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);

    useEffect(() => {
        let isActive = true;

        const loadHistory = async () => {
            setIsLoadingHistory(true);
            try {
                const items = await fetchRateHistory(currency, 1500);
                if (isActive) {
                    setPersistedHistory(items);
                    setHistoryError(null);
                }
            } catch (error: any) {
                if (isActive) {
                    setPersistedHistory([]);
                    setHistoryError(error?.message || '加载历史数据失败');
                }
            } finally {
                if (isActive) {
                    setIsLoadingHistory(false);
                }
            }
        };

        loadHistory();

        return () => {
            isActive = false;
        };
    }, [currency]);

    const mergedMap = new Map<string, RateData>();
    [...persistedHistory, ...history].forEach((item) => {
        const key = `${item.pubTime}-${item.rawSellingRate}`;
        mergedMap.set(key, item);
    });

    const mergedHistory = Array.from(mergedMap.values()).sort(
        (left, right) => left.fetchTimestampMs - right.fetchTimestampMs
    );

    const now = Date.now();
    // Default to '7d' if session has only recent items (e.g. initial load) to make chart useful
    const actualTimeRange = timeRange === 'session' ? '7d' : timeRange;
    
    const displayData =
        actualTimeRange === 'session' // Left for explicit session views if needed
            ? mergedHistory
            : mergedHistory.filter((item) => now - item.fetchTimestampMs <= RANGE_WINDOWS[actualTimeRange]);

    if (isLoadingHistory && mergedHistory.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 h-[300px] md:h-[400px] flex items-center justify-center text-gray-500">
                <span className="text-sm md:text-base">正在从真实后端加载历史汇率...</span>
            </div>
        );
    }

    if (mergedHistory.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 h-[300px] md:h-[400px] flex flex-col items-center justify-center text-gray-500">
                <span className="text-sm md:text-base">等待真实后端返回数据以生成图表...</span>
                {historyError && <span className="text-xs text-red-400 mt-3">历史数据加载失败：{historyError}</span>}
            </div>
        );
    }

    if (displayData.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 h-[300px] md:h-[400px] flex flex-col justify-center text-gray-500">
                <div className="flex flex-wrap bg-gray-950 rounded-lg p-1 border border-gray-800 gap-1 mb-6">
                    {RANGES.map((range) => (
                        <button
                            key={range.value}
                            onClick={() => setTimeRange(range.value)}
                            className={`flex-1 sm:flex-none px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                                timeRange === range.value
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                            }`}
                        >
                            {range.label}
                        </button>
                    ))}
                </div>
                <span className="text-sm md:text-base text-center">当前时间范围内暂无真实采样数据，请继续运行监控后再查看。</span>
            </div>
        );
    }

    const useDayLabel = timeRange === '7d' || timeRange === '30d' || timeRange === '1y';
    const chartData = displayData.map((item) => ({
        time: useDayLabel ? item.fetchTime.split(' ')[0].slice(5) : item.fetchTime.split(' ')[1],
        fullTime: item.fetchTime,
        rate: item.calculatedRate
    }));

    const rates = displayData.map((item) => item.calculatedRate);
    const padding = Math.max(targetRate * 0.02, 0.01);
    const minRate = Math.min(...rates, targetRate) - padding;
    const maxRate = Math.max(...rates, targetRate) + padding;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 h-[350px] md:h-[420px] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3 md:gap-4">
                <div>
                    <h3 className="text-gray-400 text-xs md:text-sm font-medium">真实汇率采样记录 ({currency})</h3>
                    <p className="text-[10px] md:text-xs text-gray-500 mt-1">图表会合并后端持久化历史与当前会话内的最新采样数据。</p>
                    {historyError && <p className="text-[10px] md:text-xs text-red-400 mt-1">历史数据加载失败：{historyError}</p>}
                </div>
                <div className="flex flex-wrap bg-gray-950 rounded-lg p-1 border border-gray-800 gap-1 w-full sm:w-auto">
                    {RANGES.map((range) => (
                        <button
                            key={range.value}
                            onClick={() => setTimeRange(range.value)}
                            className={`flex-1 sm:flex-none px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                                timeRange === range.value
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                            }`}
                        >
                            {range.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-grow w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                        <XAxis dataKey="time" stroke="#6b7280" fontSize={10} tickMargin={8} minTickGap={20} />
                        <YAxis domain={[minRate, maxRate]} stroke="#6b7280" fontSize={10} tickFormatter={(value) => value.toFixed(4)} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1f2937',
                                borderColor: '#374151',
                                color: '#f3f4f6',
                                borderRadius: '0.5rem',
                                fontSize: '12px'
                            }}
                            itemStyle={{ color: '#60a5fa', fontWeight: 600 }}
                            labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: '10px' }}
                            labelFormatter={(label, payload) => {
                                if (payload && payload.length > 0) {
                                    return payload[0].payload.fullTime;
                                }
                                return label;
                            }}
                            formatter={(value: number) => [value.toFixed(4), '汇率']}
                        />
                        <ReferenceLine
                            y={targetRate}
                            stroke="#22c55e"
                            strokeDasharray="3 3"
                            label={{ position: 'insideTopLeft', value: '目标价', fill: '#22c55e', fontSize: 10, offset: 5 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="rate"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, fill: '#3b82f6', stroke: '#1e3a8a', strokeWidth: 2 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
