import React, { useState } from 'react';
import { RateData } from '../types.ts';
import { Calculator, ArrowRightLeft, TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface Props {
    currentRate: RateData | null;
    previousRate: RateData | null;
    currency: string;
    trendComparisonMinutes: number;
}

export const CurrencyConverter: React.FC<Props> = ({ 
    currentRate, 
    previousRate, 
    currency, 
    trendComparisonMinutes 
}) => {
    const [baseAmount, setBaseAmount] = useState<string>('50000');
    const [baseCurrency, setBaseCurrency] = useState<'FOREIGN' | 'RMB'>('FOREIGN');
    const [rateSource, setRateSource] = useState<'boc' | 'yahoo'>('boc');

    if (!currentRate) return null;

    const actualRateSource = (rateSource === 'boc' && currentRate.bocRate) ? 'boc' : 'yahoo';
    const rateToUse = actualRateSource === 'boc' ? currentRate.bocRate! : currentRate.calculatedRate;

    let numForeign = 0;
    let numRMB = 0;
    let foreignStr = '';
    let rmbStr = '';

    if (baseCurrency === 'FOREIGN') {
        numForeign = parseFloat(baseAmount) || 0;
        numRMB = numForeign * rateToUse;
        foreignStr = baseAmount;
        rmbStr = baseAmount === '' ? '' : numRMB.toFixed(2);
    } else {
        numRMB = parseFloat(baseAmount) || 0;
        numForeign = numRMB / rateToUse;
        rmbStr = baseAmount;
        foreignStr = baseAmount === '' ? '' : numForeign.toFixed(2);
    }

    const currentCost = numRMB;
    let savings: number | null = null;
    let timeLabel = '';

    if (previousRate) {
        const prevRateToUse = actualRateSource === 'boc' 
            ? (previousRate.bocRate || previousRate.calculatedRate) 
            : previousRate.calculatedRate;
        const prevCost = numForeign * prevRateToUse;
        savings = prevCost - currentCost;

        // Calculate actual time diff
        const actualDiffMins = (currentRate.fetchTimestampMs - previousRate.fetchTimestampMs) / (60 * 1000);
        
        const formatTimeSpan = (mins: number) => {
            if (mins < 60) return `${Math.max(1, Math.round(mins))}分钟前`;
            if (mins < 24 * 60) return `${Math.round(mins / 60)}小时前`;
            return `${Math.round(mins / (24 * 60))}天前`;
        };

        // If actual diff is >= 90% of configured, use configured text, otherwise prompt fallback
        const hasEnoughData = actualDiffMins >= trendComparisonMinutes * 0.9;
        
        if (hasEnoughData) {
            timeLabel = formatTimeSpan(trendComparisonMinutes);
        } else {
            timeLabel = `(数据不足) 实际${formatTimeSpan(actualDiffMins)}`;
        }
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 mb-4 md:mb-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-blue-500" />
                    <h3 className="text-gray-300 text-sm md:text-base font-semibold">换汇测算计算器 ({currency})</h3>
                </div>

                <div className="flex items-center bg-gray-950 rounded-lg p-1 border border-gray-800 shadow-inner">
                    <button
                        onClick={() => setRateSource('boc')}
                        disabled={!currentRate.bocRate}
                        className={`flex-1 sm:flex-none px-3 py-1 rounded-md text-[10px] md:text-xs font-medium transition-all ${
                            actualRateSource === 'boc'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed'
                        }`}
                    >
                        中行卖出价
                    </button>
                    <button
                        onClick={() => setRateSource('yahoo')}
                        className={`flex-1 sm:flex-none px-3 py-1 rounded-md text-[10px] md:text-xs font-medium transition-all ${
                            actualRateSource === 'yahoo'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        Yahoo 参考价
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className="md:col-span-4">
                    <label className="block text-xs text-gray-500 mb-1.5 ml-1">我想买入的外币数量</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={foreignStr}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                setBaseAmount(e.target.value);
                                setBaseCurrency('FOREIGN');
                            }}
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-blue-500 transition-colors pl-4 pr-12 font-bold"
                            placeholder="0.00"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">{currency}</span>
                    </div>
                </div>

                <div className="hidden md:flex md:col-span-1 justify-center">
                    <ArrowRightLeft className="w-5 h-5 text-gray-700" />
                </div>

                <div className="md:col-span-7 bg-gray-950/50 rounded-xl p-4 border border-gray-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1.5 ml-1">预计花费 (人民币)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg font-bold">¥</span>
                            <input
                                type="number"
                                value={rmbStr}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                    setBaseAmount(e.target.value);
                                    setBaseCurrency('RMB');
                                }}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2.5 px-3 text-white focus:outline-none focus:border-blue-500 transition-colors pl-8 text-xl md:text-2xl font-bold tracking-tight"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {savings !== null && numForeign > 0 && (
                        <div className={`px-4 py-2 rounded-lg border flex flex-col items-center sm:items-end ${
                            savings >= 0 
                                ? 'bg-green-500/10 border-green-500/20 text-green-400' 
                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}>
                            <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-medium uppercase tracking-wider mb-0.5 text-center sm:text-right">
                                {savings >= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                {savings >= 0 ? `比 ${timeLabel} 节省了` : `比 ${timeLabel} 多花`}
                            </div>
                            <p className="font-bold text-base md:text-lg">
                                ¥{Math.abs(savings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    )}
                </div>
            </div>
            
            <p className="mt-4 text-[10px] md:text-xs text-gray-600 flex items-center gap-1">
                <Minus className="w-3 h-3" />
                测算基于实时 {actualRateSource === 'boc' ? '中国银行外汇买入卖出价' : 'Yahoo Finance 实时汇率'}，实际交易请以中行手机银行或柜台为准。
            </p>
        </div>
    );
};
