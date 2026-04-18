export interface RateData {
    currency?: string;
    currencyName?: string;
    rawSellingRate: number; // e.g., 468.25 (per 100 units)
    calculatedRate: number; // e.g., 4.6825 (per 1 unit)
    pubTime: string;
    fetchTime: string;
    fetchTimestampMs: number;
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
    targetRate: number;
}

export interface SystemConfig {
    monitoredCurrencies: MonitoredCurrencyConfig[];
    checkIntervalSeconds: number;
    isRunning: boolean;
    webhookUrl: string;
    telegramBotToken: string;
    telegramChatId: string;
    rateSource?: string;
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
