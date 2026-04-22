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

export const calculateThresholds = (
    history: RateData[],
    currencyCode: string,
    windowDays: number = 14
): DynamicThresholds | null => {
    if (history.length === 0) return null;

    const now = Date.now();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    
    // Filter by time window
    let pool = history.filter(r => r.fetchTimestampMs && (now - r.fetchTimestampMs) <= windowMs);
    
    let usedFallback = false;
    if (pool.length < 5) {
        pool = history;
        usedFallback = true;
    }

    const rates = pool
        .map(r => r.calculatedRate)
        .filter(r => r > 0)
        .sort((a, b) => a - b);
        
    if (rates.length < 5) return null; // Too few data points for reliable calculation

    const p10 = rates[Math.floor(rates.length * 0.10)];
    const p90 = rates[Math.floor(rates.length * 0.90)];

    let range = p90 - p10;
    const minRange = MIN_RANGE_MAP[currencyCode] || 0.05;
    if (range < minRange) range = minRange;

    const bestZoneUpper = p10 + range * 0.12;
    const goodZoneUpper = p10 + range * 0.25;
    const buffer = range * 0.05;

    if (process.env.NODE_ENV === 'development') {
        console.log(`[Frontend Debug] ${currencyCode} | Window: ${windowDays}d | Fallback: ${usedFallback} | Samples: ${rates.length} | p10: ${p10}, p90: ${p90}, range: ${range.toFixed(4)}, bestZone: ${bestZoneUpper.toFixed(4)}, goodZone: ${goodZoneUpper.toFixed(4)}`);
    }

    return {
        p10,
        p90,
        range,
        bestZoneUpper,
        goodZoneUpper,
        buffer
    };
};

export const suggestTargetRate = (history: RateData[], windowDays: number = 14): number | null => {
    if (!history.length) return null;
    const currency = history[0].currency || 'AUD';
    const thresholds = calculateThresholds(history, currency, windowDays);
    return thresholds ? Number(thresholds.bestZoneUpper.toFixed(4)) : null;
};
