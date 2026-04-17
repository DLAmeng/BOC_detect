import { RateData } from '../types.ts';

const formatDateTime = (timestampMs: number) => {
    const date = new Date(timestampMs);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    const seconds = `${date.getSeconds()}`.padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const fetchRealRate = async (currency: string): Promise<RateData> => {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

    try {
        const response = await fetch(`${apiBaseUrl}/rates?currency=${encodeURIComponent(currency)}`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        const rawRate = Number(data.rawSellingRate);
        const calculatedRate = Number(
            Number.isFinite(data.calculatedRate)
                ? data.calculatedRate
                : (rawRate / 100).toFixed(4)
        );
        const fetchTimestampMs = Date.now();

        return {
            rawSellingRate: rawRate,
            calculatedRate: calculatedRate,
            pubTime: data.pubTime,
            fetchTime: data.fetchTime || formatDateTime(fetchTimestampMs),
            fetchTimestampMs
        };
    } catch (error) {
        console.error("Failed to fetch real rate:", error);
        throw error;
    }
};
