import { RateData } from '../types.ts';

const MIN_RANGE_MAP: Record<string, number> = {
    AUD: 0.04,
    USD: 0.05,
    JPY: 0.0030,
    EUR: 0.06,
    GBP: 0.06,
    HKD: 0.01,
};

export interface DynamicThresholds {
    p10: number;
    p90: number;
    range: number;
    bestZoneUpper: number;
    goodZoneUpper: number;
    buffer: number;
}

export interface ThresholdsResult {
    thresholds: DynamicThresholds | null;
    meta: {
        requestedWindowDays: number;
        windowSampleCount: number;
        totalSampleCount: number;
        usedFallback: boolean;
        effectiveSampleCount: number;
        insufficientWindowData: boolean;
        strictWindow: boolean;
    };
}

/**
 * 计算动态阈值，并带回丰富的计算状态元数据
 */
export const calculateThresholdsWithMeta = (
    history: RateData[],
    currencyCode: string,
    windowDays: number = 14,
    strictWindow: boolean = true
): ThresholdsResult => {
    const totalSampleCount = history.length;
    const now = Date.now();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    
    // 1. 过滤窗口内样本
    let pool = history.filter(r => r.fetchTimestampMs && (now - r.fetchTimestampMs) <= windowMs);
    const windowSampleCount = pool.length;
    
    let usedFallback = false;
    let insufficientWindowData = windowSampleCount < 5;
    
    // 2. 处理模式逻辑
    if (insufficientWindowData) {
        if (strictWindow) {
            // 严格模式：不足则不回退，直接返回空阈值
            return {
                thresholds: null,
                meta: {
                    requestedWindowDays: windowDays,
                    windowSampleCount,
                    totalSampleCount,
                    usedFallback: false,
                    effectiveSampleCount: 0,
                    insufficientWindowData: true,
                    strictWindow
                }
            };
        } else {
            // 回退模式：使用全量历史
            pool = history;
            usedFallback = true;
        }
    }

    // 3. 按小时聚合数据点，以消除高频实时采样对百分位数计算的权重污染
    const hourlyBuckets: Record<number, number[]> = {};
    for (const r of pool) {
        if (!r.calculatedRate || r.calculatedRate <= 0) continue;
        const hourKey = Math.floor(r.fetchTimestampMs / (60 * 60 * 1000));
        if (!hourlyBuckets[hourKey]) {
            hourlyBuckets[hourKey] = [];
        }
        hourlyBuckets[hourKey].push(r.calculatedRate);
    }

    // 每个小时取平均值作为一个代表性样本点
    const rates = Object.values(hourlyBuckets)
        .map(bucketRates => {
            const sum = bucketRates.reduce((a, b) => a + b, 0);
            return sum / bucketRates.length;
        })
        .sort((a, b) => a - b);
    
    const effectiveSampleCount = rates.length;
    if (effectiveSampleCount < 5) {
        return {
            thresholds: null,
            meta: {
                requestedWindowDays: windowDays,
                windowSampleCount,
                totalSampleCount,
                usedFallback,
                effectiveSampleCount,
                insufficientWindowData: true,
                strictWindow
            }
        };
    }

    const p10 = rates[Math.floor(rates.length * 0.10)];
    const p90 = rates[Math.floor(rates.length * 0.90)];

    let range = p90 - p10;
    const minRange = MIN_RANGE_MAP[currencyCode] || 0.05;
    if (range < minRange) range = minRange;

    const bestZoneUpper = p10 + range * 0.12;
    const goodZoneUpper = p10 + range * 0.25;
    const buffer = range * 0.05;

    const thresholds = { p10, p90, range, bestZoneUpper, goodZoneUpper, buffer };

    console.log(`[Frontend Threshold Meta] ${currencyCode} | Requested: ${windowDays}d | Strict: ${strictWindow} | Fallback: ${usedFallback} | WinCount: ${windowSampleCount} | Final: ${effectiveSampleCount} | bestZone: ${bestZoneUpper.toFixed(4)}`);

    return {
        thresholds,
        meta: {
            requestedWindowDays: windowDays,
            windowSampleCount,
            totalSampleCount,
            usedFallback,
            effectiveSampleCount,
            insufficientWindowData,
            strictWindow
        }
    };
};

/**
 * 原有的 calculateThresholds 保持签名兼容
 */
export const calculateThresholds = (
    history: RateData[],
    currencyCode: string,
    windowDays: number = 14
): DynamicThresholds | null => {
    // 默认保持 Fallback 行为，以防 Dashboard 等其他页面需要线
    return calculateThresholdsWithMeta(history, currencyCode, windowDays, false).thresholds;
};

export const suggestTargetRate = (history: RateData[], windowDays: number = 14): number | null => {
    if (!history.length) return null;
    const currency = history[0].currency || 'AUD';
    // 建议价应该根据用户选择的窗口来算出
    const result = calculateThresholdsWithMeta(history, currency, windowDays, true);
    return result.thresholds ? Number(result.thresholds.bestZoneUpper.toFixed(4)) : null;
};
