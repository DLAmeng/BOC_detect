import React, { useEffect, useState } from 'react';
import { RateData } from '../types.ts';
import { fetchRateHistory } from '../utils/api.ts';
import { calculateThresholdsWithMeta } from '../utils/rateStats.ts';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Info, AlertCircle, Download } from 'lucide-react';
import { formatWithTimezone } from '../utils/time.ts';

type TimeRange = '24h' | '7d' | '14d' | '30d' | '3m' | '6m' | '1y';

interface Props {
    history: RateData[];
    currency: string;
    windowDays?: number;
    targetRate?: number;
    timezone: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const RANGE_WINDOWS: Record<TimeRange, number> = {
    '24h': 24 * HOUR_MS,
    '7d': 7 * DAY_MS,
    '14d': 14 * DAY_MS,
    '30d': 30 * DAY_MS,
    '3m': 90 * DAY_MS,
    '6m': 180 * DAY_MS,
    '1y': 365 * DAY_MS,
};

const RANGES: { value: TimeRange; label: string }[] = [
    { value: '24h', label: '24H' },
    { value: '7d', label: '7D' },
    { value: '14d', label: '14D' },
    { value: '30d', label: '30D' },
    { value: '3m', label: '3M' },
    { value: '6m', label: '6M' },
    { value: '1y', label: '1Y' },
];

/**
 * 对高频采样数据进行前端重采样平滑处理
 * 确保图表在数据点极其密集时依然保持“丝滑”感
 */
const resampleData = (data: RateData[], range: TimeRange): RateData[] => {
    // 如果数据点很少（例如只有几十个点），不需要重采样
    if (data.length < 150) return data;

    let bucketMs: number;
    switch (range) {
        case '24h': bucketMs = 10 * 60 * 1000; break; // 10 分钟一个点
        case '7d':  bucketMs = 60 * 60 * 1000; break; // 1 小时一个点
        case '14d': bucketMs = 2 * 60 * 60 * 1000; break; // 2 小时
        case '30d': bucketMs = 4 * 60 * 60 * 1000; break; // 4 小时
        case '3m':  bucketMs = 12 * 60 * 60 * 1000; break; // 12 小时
        default:    bucketMs = 24 * 60 * 60 * 1000; // 1 天
    }

    const buckets = new Map<number, RateData[]>();
    data.forEach(item => {
        const key = Math.floor(item.fetchTimestampMs / bucketMs) * bucketMs;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(item);
    });

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([key, items]) => {
            // 计算桶内均值
            const avgRate = items.reduce((sum, i) => sum + (i.calculatedRate || 0), 0) / items.length;
            const bocRates = items.map(i => i.bocRate).filter((v): v is number => v !== undefined);
            const avgBocRate = bocRates.length > 0 
                ? bocRates.reduce((a, b) => a + b, 0) / bocRates.length 
                : undefined;
            
            // 取桶内最后一个点作为元数据基础
            const lastItem = items[items.length - 1];
            
            return {
                ...lastItem,
                fetchTimestampMs: key, 
                calculatedRate: Number(avgRate.toFixed(4)),
                bocRate: avgBocRate ? Number(avgBocRate.toFixed(4)) : undefined
            };
        });
};

export const RateChart = ({ history, currency, windowDays = 14, targetRate, timezone }: Props) => {
    const [timeRange, setTimeRange] = useState<TimeRange>('7d');
    const [persistedHistory, setPersistedHistory] = useState<RateData[]>([]);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);

    useEffect(() => {
        let isActive = true;

        const loadHistory = async () => {
            setIsLoadingHistory(true);
            try {
                const items = await fetchRateHistory(currency, 10000);
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
        const key = item.fetchTimestampMs.toString();
        mergedMap.set(key, item);
    });

    const mergedHistory = Array.from(mergedMap.values()).sort(
        (left, right) => left.fetchTimestampMs - right.fetchTimestampMs
    );

    const now = Date.now();
    // Use type assertion to satisfy TS indexing requirements
    const rangeWindow = RANGE_WINDOWS[timeRange as TimeRange];
    const rawDisplayData = mergedHistory.filter((item) => now - item.fetchTimestampMs <= rangeWindow);

    const handleExportCSV = () => {
        if (!rawDisplayData.length) return;

        const headers = ['Fetch Time', 'Timestamp MS', 'Currency', 'Yahoo Rate', 'BOC Rate', 'Source'];
        const rows = rawDisplayData.map(item => [
            `"${item.fetchTime}"`,
            item.fetchTimestampMs,
            `"${currency}"`,
            item.calculatedRate,
            item.bocRate || '',
            `"${item.source || ''}"`
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `rates_${currency}_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    // 应用重采样逻辑平滑曲线
    const displayData = resampleData(rawDisplayData, timeRange);

    const hasEnoughData = displayData.length >= 2;

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

    if (!hasEnoughData) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 h-[350px] md:h-[420px] flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3 md:gap-4">
                    <div>
                        <h3 className="text-gray-400 text-xs md:text-sm font-medium">真实汇率采样记录 ({currency})</h3>
                        <p className="text-[10px] md:text-xs text-gray-500 mt-1">当前选择范围：{RANGES.find(r => r.value === timeRange)?.label}</p>
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
                <div className="flex-grow flex flex-col items-center justify-center text-gray-500 bg-gray-950/30 rounded-lg border border-gray-800/50">
                    <span className="text-sm md:text-base text-center px-6">
                        {displayData.length === 1 
                            ? "当前范围内仅有一个采样点，请扩大时间范围或等待更多数据产生以生成图表。" 
                            : "当前时间范围内暂无真实采样数据，请继续运行监控或选择更长的时间跨度。"}
                    </span>
                    {mergedHistory.length > 0 && timeRange === '24h' && (
                        <button 
                            onClick={() => setTimeRange('7d')}
                            className="mt-4 text-blue-400 text-xs hover:underline"
                        >
                            查看最近 7 天的历史数据
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const chartData = displayData.map((item) => {
        let yahooRate: number | undefined = item.calculatedRate;
        let bocRate: number | undefined = item.bocRate;

        if (item.source && (item.source.includes('boc.cn') || item.source === 'BOC')) {
            bocRate = item.calculatedRate;
            yahooRate = undefined;
        }
        
        if (item.source && item.source.includes('Yahoo Finance')) {
            yahooRate = item.calculatedRate;
        }

        return {
            fetchTimestampMs: item.fetchTimestampMs,
            fullTime: item.fetchTime,
            rate: yahooRate,
            bocRate: bocRate
        };
    });

    const { thresholds, meta } = calculateThresholdsWithMeta(mergedHistory, currency, windowDays, true);

    const rates = displayData.flatMap((item) => [item.calculatedRate, item.bocRate].filter((v): v is number => v !== undefined));
    const extraPoints = [];
    if (thresholds) {
        extraPoints.push(thresholds.bestZoneUpper, thresholds.goodZoneUpper);
    }
    
    const allValues = [...rates, ...extraPoints];
    if (targetRate) {
        allValues.push(targetRate);
    }
    const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;
    const dataMax = allValues.length > 0 ? Math.max(...allValues) : 1;
    const diff = dataMax - dataMin;
    const padding = diff === 0 ? dataMin * 0.005 : diff * 0.1;
    
    const minRate = dataMin - padding;
    const maxRate = dataMax + padding;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 h-auto min-h-[420px] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3 md:gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-gray-400 text-xs md:text-sm font-medium">真实汇率采样记录 ({currency})</h3>
                        <span className="bg-blue-500/10 text-blue-400 text-[9px] px-1.5 py-0.5 rounded border border-blue-500/20">
                            {windowDays}天计算窗口
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        <p className="text-[10px] md:text-xs text-gray-500">
                            窗口内样本: <span className={meta.insufficientWindowData ? 'text-yellow-500 font-bold' : 'text-gray-300'}>{meta.windowSampleCount}</span>
                        </p>
                        <p className="text-[10px] md:text-xs text-gray-500">
                            总历史样本: <span className="text-gray-300">{meta.totalSampleCount}</span>
                        </p>
                        <p className="text-[10px] md:text-xs text-gray-500 flex items-center gap-1">
                            <Info className="w-3 h-3 text-gray-600" />
                            <span className="text-gray-600 truncate max-w-[120px] md:max-w-none">图表范围不影响阈值计算</span>
                        </p>
                    </div>
                    {historyError && <p className="text-[10px] md:text-xs text-red-400 mt-1">历史数据加载失败：{historyError}</p>}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto overflow-hidden">
                    <div className="flex-grow sm:flex-grow-0 flex flex-nowrap bg-gray-950 rounded-lg p-1 border border-gray-800 gap-1 overflow-x-auto no-scrollbar">
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
                    
                    <button
                        onClick={handleExportCSV}
                        title="导出当前范围原始数据为 CSV"
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 md:py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors text-[10px] md:text-xs font-medium"
                    >
                        <Download className="w-3 h-3" />
                        <span className="hidden sm:inline text-[10px] md:text-xs">导出数据</span>
                        <span className="sm:hidden text-[10px]">导出</span>
                    </button>
                </div>
            </div>

            {meta.insufficientWindowData && (
                <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] md:text-xs text-yellow-200/80 leading-relaxed">
                        当前 <span className="font-bold text-yellow-400">{windowDays}天</span> 计算窗口内样本不足（仅 {meta.windowSampleCount} 个，需 5 个），暂不绘制动态阈值线。
                        您可以修改配置扩大窗口，或等待后台积累更多采样数据。
                    </p>
                </div>
            )}

            <div className="w-full h-[260px] md:h-[320px] lg:h-[360px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                        <XAxis 
                            dataKey="fetchTimestampMs" 
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            stroke="#6b7280" 
                            fontSize={10} 
                            tickMargin={8} 
                            minTickGap={30}
                            tickFormatter={(unixTime) => {
                                if (timeRange === '24h') {
                                    return formatWithTimezone(unixTime, timezone, 'HH:mm');
                                } else {
                                    return formatWithTimezone(unixTime, timezone, 'MM-dd');
                                }
                            }}
                        />
                        <YAxis width={50} domain={[minRate, maxRate]} stroke="#6b7280" fontSize={10} tickFormatter={(value) => value.toFixed(4)} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1f2937',
                                borderColor: '#374151',
                                color: '#f3f4f6',
                                borderRadius: '0.5rem',
                                fontSize: '12px'
                            }}
                            itemStyle={{ fontWeight: 600 }}
                            labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: '10px' }}
                            labelFormatter={(label, payload) => {
                                if (payload && payload.length > 0) {
                                    const item = payload[0].payload;
                                    return formatWithTimezone(item.fetchTimestampMs, timezone, 'yyyy-MM-dd HH:mm:ss');
                                }
                                return label;
                            }}
                            formatter={(value: any, name: any) => [
                                Number(value).toFixed(4), 
                                name === 'rate' ? 'Yahoo 汇率' : '中行 汇率'
                            ]}
                        />
                        {thresholds && (
                            <>
                                <ReferenceLine
                                    y={thresholds.bestZoneUpper}
                                    stroke="#ef4444"
                                    strokeDasharray="4 4"
                                />
                                <ReferenceLine
                                    y={thresholds.goodZoneUpper}
                                    stroke="#eab308"
                                    strokeDasharray="4 4"
                                />
                            </>
                        )}
                        {targetRate && (
                            <ReferenceLine
                                y={targetRate}
                                stroke="#f87171"
                                strokeWidth={2}
                                label={{ 
                                    value: '目标价', 
                                    position: 'left', 
                                    fill: '#f87171',
                                    fontSize: 10,
                                    fontWeight: 'bold'
                                }}
                            />
                        )}
                        <Line
                            name="rate"
                            type="monotone"
                            dataKey="rate"
                            stroke="#3b82f6"
                            isAnimationActive={false}
                            strokeWidth={1.5}
                            dot={false}
                            activeDot={{ r: 4, fill: '#3b82f6', stroke: '#1e3a8a', strokeWidth: 2 }}
                            connectNulls
                        />
                        <Line
                            name="bocRate"
                            type="monotone"
                            dataKey="bocRate"
                            stroke="#f59e0b"
                            strokeWidth={1}
                            strokeDasharray="4 2"
                            dot={false}
                            activeDot={{ r: 3, fill: '#f59e0b', stroke: '#78350f', strokeWidth: 2 }}
                            connectNulls
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-2 md:mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 border-t border-gray-800/50 pt-3 md:pt-4">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-[#3b82f6] rounded-full"></div>
                    <span className="text-[10px] md:text-xs text-gray-500 font-medium">Yahoo 汇率 (实线)</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 border-t-2 border-dashed border-[#f59e0b]"></div>
                    <span className="text-[10px] md:text-xs text-gray-500 font-medium">中行参考 (橙虚)</span>
                </div>
                {thresholds && (
                    <>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 border-t-2 border-dashed border-[#ef4444]"></div>
                            <div className="flex flex-col">
                                <span className="text-[10px] md:text-xs text-[#ef4444] font-bold">强烈换汇区 (Best)</span>
                                <span className="text-[9px] text-gray-600 font-mono">≤{thresholds.bestZoneUpper.toFixed(4)}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 border-t-2 border-dashed border-[#eab308]"></div>
                            <div className="flex flex-col">
                                <span className="text-[10px] md:text-xs text-[#eab308] font-bold">适合换汇区 (Good)</span>
                                <span className="text-[9px] text-gray-600 font-mono">≤{thresholds.goodZoneUpper.toFixed(4)}</span>
                            </div>
                        </div>
                    </>
                )}
                {targetRate && (
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-0.5 bg-[#f87171]"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] md:text-xs text-[#f87171] font-bold">🎯 目标买入价</span>
                            <span className="text-[9px] text-gray-600 font-mono">={targetRate.toFixed(4)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
