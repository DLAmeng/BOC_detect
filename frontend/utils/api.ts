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

const getApiBaseUrl = () => (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

const normalizeRateData = (data: any): RateData => {
    const fallbackTimestamp = Date.now();
    const fetchTimestampMs = Number.isFinite(data.fetchTimestampMs)
        ? Number(data.fetchTimestampMs)
        : Date.parse(data.fetchTime || '') || fallbackTimestamp;
    const rawRate = Number(data.rawSellingRate);

    return {
        rawSellingRate: rawRate,
        calculatedRate: Number(
            Number.isFinite(data.calculatedRate)
                ? data.calculatedRate
                : (rawRate / 100).toFixed(4)
        ),
        pubTime: data.pubTime,
        fetchTime: data.fetchTime || formatDateTime(fetchTimestampMs),
        fetchTimestampMs
    };
};

export const fetchRealRate = async (currency: string): Promise<RateData> => {
    try {
        const response = await fetch(`${getApiBaseUrl()}/rates?currency=${encodeURIComponent(currency)}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.details || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return normalizeRateData(data);
    } catch (error) {
        console.error('Failed to fetch real rate:', error);
        throw error;
    }
};

export const fetchRateHistory = async (currency: string, limit = 1000): Promise<RateData[]> => {
    const response = await fetch(
        `${getApiBaseUrl()}/history?currency=${encodeURIComponent(currency)}&limit=${limit}`
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map(normalizeRateData);
};

export const sendTelegramNotifications = async ({
    messages,
    botToken,
    chatId
}: {
    messages: string[];
    botToken?: string;
    chatId?: string;
}): Promise<{ success: boolean; skipped?: boolean; sent?: number; reason?: string }> => {
    const response = await fetch(`${getApiBaseUrl()}/notify/telegram`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messages,
            botToken,
            chatId
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || data.details || `HTTP error! status: ${response.status}`);
    }

    return data;
};
