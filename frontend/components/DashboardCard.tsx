import React from 'react';
import { RateData } from '../types.ts';
import { TrendingDown, TrendingUp, Minus, Clock, RefreshCw } from 'lucide-react';

interface Props {
    currentRate: RateData | null;
    previousRate: RateData | null;
    targetRate: number;
    currency: string;
}

export const DashboardCard: React.FC<Props> = ({ currentRate, previousRate, targetRate, currency }) => {
    if (!currentRate) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 flex items-center justify-center h-48 md:h-64 relative overflow-hidden">
                <div className="flex flex-col items-center text-gray-500">
                    <RefreshCw className="w-6 h-6 md:w-8 md:h-8 animate-spin mb-3 md:mb-4" />
                    <p className="text-sm md:text-base">等待首次数据抓取 ({currency})...</p>
                </div>
            </div>
        );
    }

    const isTargetHit = currentRate.calculatedRate <= targetRate;
    
    let TrendIcon = Minus;
    let trendColor = 'text-gray-400';
    let diff = 0;

    if (previousRate) {
        diff = currentRate.calculatedRate - previousRate.calculatedRate;
        if (diff > 0) {
            TrendIcon = TrendingUp;
            trendColor = 'text-red-500'; // For CNY/Foreign, up means foreign is more expensive (bad for buying)
        } else if (diff < 0) {
            TrendIcon = TrendingDown;
            trendColor = 'text-green-500'; // Down means foreign is cheaper (good for buying)
        }
    }

    return (
        <div className={`bg-gray-900 border rounded-xl p-4 md:p-6 transition-colors duration-500 relative overflow-hidden ${isTargetHit ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'border-gray-800'}`}>
            <div className="flex justify-between items-start mb-4 md:mb-6 mt-2">
                <div>
                    <h2 className="text-gray-400 text-xs md:text-sm font-medium uppercase tracking-wider mb-1">当前汇率 (1 {currency})</h2>
                    <div className="flex items-baseline gap-2 md:gap-3 flex-wrap">
                        <span className={`text-4xl md:text-5xl font-bold tracking-tight ${isTargetHit ? 'text-green-400' : 'text-white'}`}>
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
                {isTargetHit && (
                    <span className="px-2 py-1 md:px-3 md:py-1 bg-green-500/20 text-green-400 text-[10px] md:text-xs font-bold rounded-full border border-green-500/30 animate-pulse whitespace-nowrap">
                        达到目标价
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2 md:gap-4 pt-4 md:pt-6 border-t border-gray-800">
                <div>
                    <p className="text-gray-500 text-[10px] md:text-xs mb-1">原始卖出价 (100 {currency})</p>
                    <p className="text-gray-300 font-mono text-base md:text-lg">{currentRate.rawSellingRate.toFixed(2)}</p>
                    <p className="text-gray-600 text-[10px] md:text-xs mt-0.5 md:mt-1 font-mono">÷ 100 = {currentRate.calculatedRate.toFixed(4)}</p>
                </div>
                <div>
                    <p className="text-gray-500 text-[10px] md:text-xs mb-1">目标阈值</p>
                    <p className="text-gray-300 font-mono text-base md:text-lg">≤ {targetRate.toFixed(4)}</p>
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
        </div>
    );
};
