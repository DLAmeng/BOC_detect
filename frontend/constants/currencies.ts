import { MonitoredCurrencyConfig } from '../types.ts';

export const AVAILABLE_CURRENCIES = [
    { code: 'AUD', name: '澳元 (AUD)' },
    { code: 'USD', name: '美元 (USD)' },
    { code: 'EUR', name: '欧元 (EUR)' },
    { code: 'GBP', name: '英镑 (GBP)' },
    { code: 'JPY', name: '日元 (JPY)' },
    { code: 'HKD', name: '港币 (HKD)' },
];

export const buildCurrencyConfig = (currencyCode: string): MonitoredCurrencyConfig => {
    return {
        currency: currencyCode
    };
};

export const DEFAULT_MONITORED_CURRENCIES = [
    buildCurrencyConfig('AUD'),
    buildCurrencyConfig('USD'),
];
