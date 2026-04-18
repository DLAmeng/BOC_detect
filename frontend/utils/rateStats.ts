import { RateData } from '../types.ts';

const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const PERCENTILE = 20;
const MIN_SAMPLES = 5;

const percentile = (rates: number[], p: number): number => {
    if (rates.length === 0) return 0;
    const sorted = [...rates].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

export const suggestTargetRate = (history: RateData[]): number | null => {
    if (!history.length) return null;
    const now = Date.now();

    const recent = history.filter((r) => now - r.fetchTimestampMs <= RECENT_WINDOW_MS);
    const pool = recent.length >= MIN_SAMPLES ? recent : history;

    const rates = pool.map((r) => r.calculatedRate).filter((r) => r > 0);
    if (rates.length < MIN_SAMPLES) return null;

    return Number(percentile(rates, PERCENTILE).toFixed(4));
};
