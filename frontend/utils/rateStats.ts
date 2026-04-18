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
    if (history.length < 5) return null;

    const now = Date.now();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    
    // Use windowDays to filter, fallback to all history if too few samples in window
    let pool = history.filter((r) => now - r.fetchTimestampMs <= windowMs);
    if (pool.length < 5) pool = history;

    const rates = pool
        .map((r) => r.calculatedRate)
        .filter((r) => r > 0)
        .sort((a, b) => a - b);
        
    if (rates.length < 5) return null;

    const p10 = rates[Math.floor(rates.length * 0.1)];
    const p90 = rates[Math.floor(rates.length * 0.9)];

    let range = p90 - p10;
    const minRange = MIN_RANGE_MAP[currencyCode] || 0.05;
    if (range < minRange) range = minRange;

    return {
        p10,
        p90,
        range,
        bestZoneUpper: p10 + range * 0.12,
        goodZoneUpper: p10 + range * 0.25,
        buffer: range * 0.05
    };
};

export const suggestTargetRate = (history: RateData[]): number | null => {
    if (!history.length) return null;
    const currency = history[0].currency || 'AUD';
    const thresholds = calculateThresholds(history, currency, 14);
    return thresholds ? Number(thresholds.bestZoneUpper.toFixed(4)) : null;
};
