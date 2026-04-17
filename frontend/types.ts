export interface RateData {
    rawSellingRate: number; // e.g., 468.25 (per 100 units)
    calculatedRate: number; // e.g., 4.6825 (per 1 unit)
    pubTime: string;
    fetchTime: string;
    fetchTimestampMs: number;
}

export type AlertType = 'update' | 'target_hit' | 'error' | 'info';

export interface AlertLog {
    id: string;
    type: AlertType;
    message: string;
    timestamp: string;
    read: boolean;
}

export interface SystemConfig {
    currency: string; // e.g., 'AUD', 'USD'
    targetRate: number;
    checkIntervalSeconds: number;
    isRunning: boolean;
    webhookUrl: string;
    telegramBotToken: string;
    telegramChatId: string;
}

export interface SystemState {
    currentRate: RateData | null;
    previousRate: RateData | null;
    history: RateData[];
    alerts: AlertLog[];
    config: SystemConfig;
    lastError: string | null;
    lastAlertedRate: number | null; // To prevent spamming target hits
}
