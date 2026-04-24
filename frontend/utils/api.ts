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

const getApiBaseUrl = () => {
    // 采用更具兼容性的方式获取环境变量，避免类型报错导致阻断
    const env = (import.meta as any).env;
    const baseUrl = (env && env.VITE_API_BASE_URL) || '/api';
    return baseUrl.replace(/\/$/, '');
};

const normalizeRateData = (data: any): RateData => {
    const fallbackTimestamp = Date.now();
    const fetchTimestampMs = Number.isFinite(data.fetchTimestampMs)
        ? Number(data.fetchTimestampMs)
        : Date.parse(data.fetchTime || '') || fallbackTimestamp;
    const rawRate = Number(data.rawSellingRate);

    return {
        currency: data.currency,
        currencyName: data.currencyName,
        rawSellingRate: rawRate,
        calculatedRate: Number(
            Number.isFinite(data.calculatedRate)
                ? data.calculatedRate
                : (rawRate / 100).toFixed(4)
        ),
        bocRate: data.bocRate,
        bocRawRate: data.bocRawRate,
        pubTime: data.pubTime,
        fetchTime: data.fetchTime || formatDateTime(fetchTimestampMs),
        fetchTimestampMs,
        source: data.source
    };
};

export const fetchRealRate = async (currency: string): Promise<RateData> => {
    try {
        const response = await fetch(`${getApiBaseUrl()}/rates?currency=${encodeURIComponent(currency)}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`[Frontend] Fetch real rate for ${currency} failed with status: ${response.status}`, errorData);
            throw new Error(errorData.error || errorData.details || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return normalizeRateData(data);
    } catch (error) {
        console.error(`[Frontend] Failed to fetch real rate for ${currency}:`, error);
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

export const fetchMonitorConfig = async (): Promise<any> => {
    const response = await fetch(`${getApiBaseUrl()}/config`);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.config;
};

export const saveMonitorConfig = async (config: any): Promise<any> => {
    const response = await fetch(`${getApiBaseUrl()}/config`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data.config;
};

export const fetchDashboardData = async (): Promise<{
    rates: Record<string, { current: RateData; previous: RateData }>;
    alerts: any[];
}> => {
    const response = await fetch(`${getApiBaseUrl()}/dashboard`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return {
        rates: data.rates,
        alerts: data.alerts
    };
};

export const clearBackendAlerts = async (): Promise<void> => {
    await fetch(`${getApiBaseUrl()}/alerts`, { method: 'DELETE' });
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
