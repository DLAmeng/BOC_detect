export interface RateData {
    currency?: string;
    currencyName?: string;
    rawSellingRate: number; // e.g., 468.25 (per 100 units)
    calculatedRate: number; // e.g., 4.6825 (per 1 unit)
    bocRate?: number;       // The synchronized BOC rate (e.g. 4.6825)
    bocRawRate?: number;    // The synchronized BOC raw rate (e.g. 468.25)
    pubTime: string;
    fetchTime: string;
    fetchTimestampMs: number;
    source?: string;
}

export type AlertType = 'update' | 'target_hit' | 'error' | 'info';

export interface AlertLog {
    currency?: string;
    id: string;
    type: AlertType;
    message: string;
    timestamp: string;
    read: boolean;
}

export interface MonitoredCurrencyConfig {
    currency: string;
}

export interface SystemConfig {
    monitoredCurrencies: MonitoredCurrencyConfig[];
    checkIntervalSeconds: number;
    calculationWindowDays: number;
    trendComparisonMinutes: number;
    isRunning: boolean;
    webhookUrl: string;
    telegramBotToken: string;
    telegramChatId: string;
}

export interface SystemState {
    currentRates: Record<string, RateData | null>;
    previousRates: Record<string, RateData | null>;
    historyByCurrency: Record<string, RateData[]>;
    alerts: AlertLog[];
    config: SystemConfig;
    lastErrors: Record<string, string | null>;
    lastAlertedRates: Record<string, number | null>;
}
