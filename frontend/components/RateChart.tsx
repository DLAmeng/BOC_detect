import React, { useState } from 'react';
import { RateData } from '../types.ts';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

type TimeRange = 'session' | '10m' | '30m' | '1h' | '6h' | '24h';

interface Props {
    history: RateData[];
    targetRate: number;
    currency: string;
}

const RANGE_WINDOWS: Record<Exclude<TimeRange, 'session'>, number> = {
    '10m': 10 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
};

export const RateChart: React.FC<Props> = ({ history, targetRate, currency }) => {
    const [timeRange, setTimeRange] = useState<TimeRange>('session');

    const now = Date.now();
    const displayData =
        timeRange === 'session'
            ? history
            : history.filter((item) => now - item.fetchTimestampMs <= RANGE_WINDOWS[timeRange]);

    if (history.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 h-[300px] md:h-[400px] flex items-center justify-center text-gray-500">
                <span className="text-sm md:text-base">等待真实后端返回数据以生成图表...</span>
            </div>
        );
    }

    if (displayData.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 h-[300px] md:h-[400px] flex flex-col justify-center text-gray-500">
                <div className="flex flex-wrap bg-gray-950 rounded-lg p-1 border border-gray-800 gap-1 mb-6">
                    {[
                        { value: 'session', label: '当前会话' },
                        { value: '10m', label: '10 分钟' },
                        { value: '30m', label: '30 分钟' },
                        { value: '1h', label: '1 小时' },
                        { value: '6h', label: '6 小时' },
                        { value: '24h', label: '24 小时' },
                    ].map((range) => (
                        <button
                            key={range.value}
                            onClick={() => setTimeRange(range.value as TimeRange)}
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

    const chartData = displayData.map((item) => ({
        time: item.fetchTime.split(' ')[1],
        fullTime: item.fetchTime,
        rate: item.calculatedRate
    }));

    const rates = displayData.map((item) => item.calculatedRate);
    const padding = Math.max(targetRate * 0.02, 0.01);
    const minRate = Math.min(...rates, targetRate) - padding;
    const maxRate = Math.max(...rates, targetRate) + padding;

    const ranges: { value: TimeRange; label: string }[] = [
        { value: 'session', label: '当前会话' },
        { value: '10m', label: '10 分钟' },
        { value: '30m', label: '30 分钟' },
        { value: '1h', label: '1 小时' },
        { value: '6h', label: '6 小时' },
        { value: '24h', label: '24 小时' },
    ];

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 h-[350px] md:h-[420px] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3 md:gap-4">
                <div>
                    <h3 className="text-gray-400 text-xs md:text-sm font-medium">真实汇率采样记录 ({currency})</h3>
                    <p className="text-[10px] md:text-xs text-gray-500 mt-1">图表仅展示当前会话内从真实后端抓取到的数据，不再生成模拟历史。</p>
                </div>
                <div className="flex flex-wrap bg-gray-950 rounded-lg p-1 border border-gray-800 gap-1 w-full sm:w-auto">
                    {ranges.map((range) => (
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
