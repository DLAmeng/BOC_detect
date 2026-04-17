import { MonitoredCurrencyConfig } from '../types.ts';

export const AVAILABLE_CURRENCIES = [
    { code: 'AUD', name: '澳元 (AUD)', defaultTarget: 4.66 },
    { code: 'USD', name: '美元 (USD)', defaultTarget: 7.15 },
    { code: 'EUR', name: '欧元 (EUR)', defaultTarget: 7.75 },
    { code: 'GBP', name: '英镑 (GBP)', defaultTarget: 9.0 },
    { code: 'JPY', name: '日元 (JPY)', defaultTarget: 0.047 },
    { code: 'HKD', name: '港币 (HKD)', defaultTarget: 0.91 },
];

export const buildCurrencyConfig = (currencyCode: string): MonitoredCurrencyConfig => {
    const currency = AVAILABLE_CURRENCIES.find((item) => item.code === currencyCode);

    return {
        currency: currencyCode,
        targetRate: currency?.defaultTarget || 0,
    };
};

export const DEFAULT_MONITORED_CURRENCIES = [
    buildCurrencyConfig('AUD'),
    buildCurrencyConfig('USD'),
];
