import React from 'react';
import { RateData } from '../types.ts';
import { TrendingDown, TrendingUp, Minus, Clock, RefreshCw, LineChart } from 'lucide-react';

interface Props {
    currentRate: RateData | null;
    previousRate: RateData | null;
    currency: string;
    isActive?: boolean;
    onSelect?: () => void;
}

export const DashboardCard: React.FC<Props> = ({
    currentRate,
    previousRate,
    currency,
    isActive = false,
    onSelect
}) => {
    const Wrapper = onSelect ? 'button' : 'div';

    if (!currentRate) {
        return (
            <Wrapper
                {...(onSelect ? { onClick: onSelect, type: 'button' as const } : {})}
                className={`bg-gray-900 border rounded-xl p-4 md:p-6 flex items-center justify-center h-48 md:h-64 relative overflow-hidden text-left ${
                    isActive ? 'border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]' : 'border-gray-800'
                }`}
            >
                <div className="flex flex-col items-center text-gray-500 w-full">
                    <div className="flex items-center justify-between w-full mb-4">
                        <span className="text-xs font-medium text-gray-400">监控币种 {currency}</span>
                        {onSelect && (
                            <span className={`text-[10px] px-2 py-1 rounded-full border flex items-center gap-1 ${
                                isActive ? 'text-blue-300 border-blue-500/40 bg-blue-500/10' : 'text-gray-500 border-gray-700'
                            }`}>
                                <LineChart className="w-3 h-3" /> 图表
                            </span>
                        )}
                    </div>
                    <RefreshCw className="w-6 h-6 md:w-8 md:h-8 animate-spin mb-3 md:mb-4" />
                    <p className="text-sm md:text-base">等待首次数据抓取 ({currency})...</p>
                </div>
            </Wrapper>
        );
    }

    let TrendIcon = Minus;
    let trendColor = 'text-gray-400';
    let diff = 0;

    if (previousRate) {
        diff = currentRate.calculatedRate - previousRate.calculatedRate;
        if (diff > 0) {
            TrendIcon = TrendingUp;
            trendColor = 'text-red-500';
        } else if (diff < 0) {
            TrendIcon = TrendingDown;
            trendColor = 'text-green-500';
        }
    }

    return (
        <Wrapper
            {...(onSelect ? { onClick: onSelect, type: 'button' as const } : {})}
            className={`bg-gray-900 border rounded-xl p-4 md:p-6 transition-colors duration-500 relative overflow-hidden text-left w-full ${
                isActive
                    ? 'border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]'
                    : 'border-gray-800'
            }`}
        >
            <div className="flex justify-between items-start mb-4 md:mb-6 mt-2">
                <div>
                    <h2 className="text-gray-400 text-xs md:text-sm font-medium uppercase tracking-wider mb-1">当前汇率 (1 {currency})</h2>
                    <div className="flex items-baseline gap-2 md:gap-3 flex-wrap">
                        <span className="text-4xl md:text-5xl font-bold tracking-tight text-white">
                            ¥{currentRate.calculatedRate.toFixed(4)}
                        </span>
                        {previousRate && (
                            <div className={`flex items-center text-xs md:text-sm font-medium ${trendColor}`}>
                                <TrendIcon className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                                {Math.abs(diff).toFixed(4)}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    {onSelect && (
                        <span className={`px-2 py-1 rounded-full text-[10px] md:text-xs border flex items-center gap-1 ${
                            isActive ? 'text-blue-300 border-blue-500/40 bg-blue-500/10' : 'text-gray-400 border-gray-700'
                        }`}>
                            <LineChart className="w-3 h-3" /> {isActive ? '图表中' : '查看图表'}
                        </span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:gap-4 pt-4 md:pt-6 border-t border-gray-800">
                <div>
                    <p className="text-gray-500 text-[10px] md:text-xs mb-1">中行实时参考</p>
                    <p className="text-amber-500/90 font-mono text-base md:text-lg">
                        {currentRate.bocRate ? `¥${currentRate.bocRate.toFixed(4)}` : '暂无数据'}
                    </p>
                    <p className="text-gray-600 text-[10px] md:text-xs mt-0.5 md:mt-1 font-mono">
                        {currentRate.bocRawRate ? `原始: ${currentRate.bocRawRate.toFixed(2)}` : '同步抓取中...'}
                    </p>
                </div>
                <div>
                    <p className="text-gray-500 text-[10px] md:text-xs mb-1">数据来源</p>
                    <p className="text-gray-400 font-mono text-sm md:text-base">{currentRate.source || 'Yahoo + BOC'}</p>
                </div>
            </div>

            <div className="mt-4 md:mt-6 flex flex-col gap-1.5 md:gap-2 text-[10px] md:text-xs text-gray-500 bg-gray-950 p-2.5 md:p-3 rounded-lg border border-gray-800/50">
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 发布时间:</span>
                    <span className="font-mono text-gray-400">{currentRate.pubTime}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> 抓取时间:</span>
                    <span className="font-mono text-gray-400">{currentRate.fetchTime}</span>
                </div>
            </div>
        </Wrapper>
    );
};
